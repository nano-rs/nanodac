/**
 * nanodac sync command
 *
 * Synchronizes local detection files with NanoSIEM
 */

import { readFile } from 'fs/promises';
import { relative, sep } from 'path';
import fg from 'fast-glob';
import chalk from 'chalk';
import {
  parseDetectionFile,
  validateDetection,
  NanosiemClient,
  detectionToApiPayload,
  type Detection,
  type DetectionRule,
} from '@nano-rs/dac-core';
import { requireConfig, getApiKey, type NanodacConfig } from '../config.js';

interface SyncOptions {
  dryRun?: boolean;
  force?: boolean;
  env?: string;
}

interface SyncPlan {
  create: Array<{ detection: Detection; name: string }>;
  update: Array<{ detection: Detection; remote: DetectionRule; name: string }>;
  delete: Array<{ remote: DetectionRule; name: string }>;
  unchanged: string[];
  invalid: string[];
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  const config = await requireConfig();
  const apiKey = getApiKey();

  const client = new NanosiemClient({
    apiUrl: config.apiUrl,
    searchUrl: config.searchUrl,
    apiKey,
  });

  console.log(chalk.bold('\nSyncing detections...\n'));

  // Step 1: Load and validate local detections
  console.log('Loading local detections...');
  const localDetections = await loadLocalDetections(config);

  // Step 2: Fetch remote detections
  console.log('Fetching remote detections...');
  const remoteResult = await client.listDetections();
  if (!remoteResult.success) {
    console.error(
      chalk.red(`Failed to fetch remote detections: ${remoteResult.error?.message}`)
    );
    process.exit(1);
  }

  const remoteDetections = new Map<string, DetectionRule>();
  for (const rule of remoteResult.data!) {
    remoteDetections.set(rule.name, rule);
  }

  console.log(`  Found ${localDetections.valid.size} valid local detection(s)`);
  console.log(`  Found ${remoteDetections.size} remote detection(s)`);
  console.log('');

  // Step 3: Calculate sync plan
  const plan = calculateSyncPlan(localDetections, remoteDetections, config);

  // Step 4: Display plan
  displaySyncPlan(plan);

  // Handle invalid detections
  if (localDetections.invalid.length > 0) {
    console.log(chalk.yellow('\nInvalid detections (will be skipped):'));
    for (const file of localDetections.invalid) {
      console.log(chalk.yellow(`  - ${file}`));
    }
    console.log('');
  }

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.blue('--dry-run mode: no changes applied\n'));
    return;
  }

  // Nothing to do
  if (
    plan.create.length === 0 &&
    plan.update.length === 0 &&
    plan.delete.length === 0
  ) {
    console.log(chalk.green('Everything up to date\n'));
    return;
  }

  // Confirm changes (unless --force)
  if (!options.force && config.sync?.confirmDestructive !== false) {
    const hasDestructive = plan.update.length > 0 || plan.delete.length > 0;
    if (hasDestructive) {
      console.log(
        chalk.yellow('\nThis will modify or delete remote detections.')
      );
      console.log('Use --force to skip this confirmation.\n');
      process.exit(1);
    }
  }

  // Step 5: Execute sync
  await executeSyncPlan(client, plan, config);

  console.log(chalk.green('\nSync complete\n'));
}

interface LoadResult {
  valid: Map<string, Detection>;
  invalid: string[];
}

async function loadLocalDetections(config: NanodacConfig): Promise<LoadResult> {
  const detectionsDir = config.detectionsDir;
  const patterns = [`${detectionsDir}/**/*.yaml`, `${detectionsDir}/**/*.yml`];
  const filePaths = await fg.glob(patterns);

  const valid = new Map<string, Detection>();
  const invalid: string[] = [];

  for (const filePath of filePaths) {
    const content = await readFile(filePath, 'utf-8');
    const parseResult = parseDetectionFile(content, filePath);

    if (!parseResult.success) {
      invalid.push(filePath);
      continue;
    }

    const validation = validateDetection(parseResult.detection!);
    if (!validation.valid) {
      invalid.push(filePath);
      continue;
    }

    const detection = parseResult.detection!;
    valid.set(detection.metadata.title, detection);
  }

  return { valid, invalid };
}

function calculateSyncPlan(
  local: LoadResult,
  remote: Map<string, DetectionRule>,
  config: NanodacConfig
): SyncPlan {
  const plan: SyncPlan = {
    create: [],
    update: [],
    delete: [],
    unchanged: [],
    invalid: local.invalid,
  };

  // Check local detections
  for (const [name, detection] of local.valid) {
    if (remote.has(name)) {
      const remoteRule = remote.get(name)!;
      if (needsUpdate(detection, remoteRule, config)) {
        plan.update.push({ detection, remote: remoteRule, name });
      } else {
        plan.unchanged.push(name);
      }
    } else {
      plan.create.push({ detection, name });
    }
  }

  // Check for orphaned remote detections
  if (config.sync?.deleteOrphans) {
    for (const [name, rule] of remote) {
      if (!local.valid.has(name)) {
        plan.delete.push({ remote: rule, name });
      }
    }
  }

  return plan;
}

/**
 * Detection-as-Code provenance for a local file (NAN-1764): the repo-root-relative
 * `source_path` nano needs to target the real file, plus the optional repo URL.
 *
 * `detection.filePath` is absolute (config's `detectionsDir` is resolved to an
 * absolute path), so we re-anchor it to the config directory — the DaC repo root
 * by convention — and normalize to forward slashes for GitHub.
 */
function sourceProvenance(
  config: NanodacConfig,
  detection: Detection
): { sourcePath: string; sourceRepoUrl?: string } {
  const base = config.baseDir ?? process.cwd();
  const rel = relative(base, detection.filePath);
  const sourcePath = sep === '\\' ? rel.split(sep).join('/') : rel;
  return { sourcePath, sourceRepoUrl: config.repoUrl };
}

function needsUpdate(
  local: Detection,
  remote: DetectionRule,
  config: NanodacConfig
): boolean {
  // Compare key fields
  const localPayload = detectionToApiPayload(local);

  // NAN-1764: refresh/backfill DaC provenance so a subsequent tuning PR targets
  // the real file. A capable server always echoes `source_path` (as `null` for
  // nano-native rules); an older nano omits the field entirely — key off that
  // `undefined` so this never churns every rule against a server that can't
  // store provenance. On a capable server this fires once to backfill, then on
  // any future move/rename, and settles when the recorded path matches.
  if (remote.source_path !== undefined) {
    const { sourcePath } = sourceProvenance(config, local);
    if ((remote.source_path ?? '') !== sourcePath) return true;
  }

  if (localPayload.query !== remote.query) return true;
  if (localPayload.severity !== remote.severity) return true;
  if (localPayload.mode !== remote.mode) return true;
  if (localPayload.detection_mode !== remote.detection_mode) return true;
  if (localPayload.description !== remote.description) return true;
  if (localPayload.schedule_cron !== remote.schedule_cron) return true;
  if (localPayload.lookback_minutes !== remote.lookback_minutes) return true;

  // Compare arrays
  if (
    JSON.stringify(localPayload.mitre_tactics) !==
    JSON.stringify(remote.mitre_tactics)
  )
    return true;
  if (
    JSON.stringify(localPayload.mitre_techniques) !==
    JSON.stringify(remote.mitre_techniques)
  )
    return true;
  if (JSON.stringify(localPayload.tags) !== JSON.stringify(remote.tags))
    return true;

  // Compare AI triage hints
  if (
    JSON.stringify(localPayload.ai_triage_hints) !==
    JSON.stringify(remote.ai_triage_hints)
  )
    return true;

  // Compare additional fields
  if (localPayload.alert_mode !== remote.alert_mode) return true;
  if (localPayload.reference_url !== remote.reference_url) return true;
  if (localPayload.author !== remote.author) return true;
  if (localPayload.realtime_enabled !== remote.realtime_enabled) return true;
  if (localPayload.case_visibility !== remote.case_visibility) return true;
  if (localPayload.folder !== remote.folder) return true;
  if (
    JSON.stringify(localPayload.case_group_ids) !==
    JSON.stringify(remote.case_group_ids)
  )
    return true;
  if (localPayload.auto_tuning_enabled !== remote.auto_tuning_enabled)
    return true;
  if (
    localPayload.auto_tuning_min_confidence !==
    remote.auto_tuning_min_confidence
  )
    return true;
  if (localPayload.auto_tuning_critical !== remote.auto_tuning_critical)
    return true;

  // Playbook auto-attach fields
  const localMode = localPayload.playbook_selector_mode ?? 'none';
  const remoteMode = remote.playbook_selector_mode ?? 'none';
  if (localMode !== remoteMode) return true;
  if ((localPayload.playbook_id ?? null) !== (remote.playbook_id ?? null))
    return true;

  return false;
}

function displaySyncPlan(plan: SyncPlan): void {
  console.log(chalk.bold('Sync Plan:'));
  console.log(chalk.green(`  Create: ${plan.create.length}`));
  console.log(chalk.yellow(`  Update: ${plan.update.length}`));
  console.log(chalk.red(`  Delete: ${plan.delete.length}`));
  console.log(chalk.gray(`  Unchanged: ${plan.unchanged.length}`));
  console.log('');

  if (plan.create.length > 0) {
    console.log(chalk.green('Will create:'));
    for (const item of plan.create) {
      console.log(chalk.green(`  + ${item.name}`));
    }
    console.log('');
  }

  if (plan.update.length > 0) {
    console.log(chalk.yellow('Will update:'));
    for (const item of plan.update) {
      console.log(chalk.yellow(`  ~ ${item.name}`));
    }
    console.log('');
  }

  if (plan.delete.length > 0) {
    console.log(chalk.red('Will delete:'));
    for (const item of plan.delete) {
      console.log(chalk.red(`  - ${item.name}`));
    }
    console.log('');
  }
}

async function executeSyncPlan(
  client: NanosiemClient,
  plan: SyncPlan,
  config: NanodacConfig
): Promise<void> {
  // Create
  for (const item of plan.create) {
    const payload = detectionToApiPayload(
      item.detection,
      sourceProvenance(config, item.detection)
    );
    const result = await client.createDetection(payload);
    if (result.success) {
      console.log(chalk.green(`  Created: ${item.name}`));
      if (result.data?.warning) {
        console.log(chalk.yellow(`    Warning: ${result.data.warning}`));
      }
    } else {
      console.log(
        chalk.red(`  Failed to create ${item.name}: ${result.error?.message}`)
      );
    }
  }

  // Update
  for (const item of plan.update) {
    const payload = detectionToApiPayload(
      item.detection,
      sourceProvenance(config, item.detection)
    );
    const result = await client.updateDetection(item.remote.id, payload);
    if (result.success) {
      console.log(chalk.yellow(`  Updated: ${item.name}`));
      if (result.data?.warning) {
        console.log(chalk.yellow(`    Warning: ${result.data.warning}`));
      }
    } else {
      console.log(
        chalk.red(`  Failed to update ${item.name}: ${result.error?.message}`)
      );
    }
  }

  // Delete
  for (const item of plan.delete) {
    const result = await client.deleteDetection(item.remote.id);
    if (result.success) {
      console.log(chalk.red(`  Deleted: ${item.name}`));
    } else {
      console.log(
        chalk.red(`  Failed to delete ${item.name}: ${result.error?.message}`)
      );
    }
  }
}
