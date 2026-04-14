/**
 * nanodac diff command
 *
 * Shows differences between local and remote detections
 */

import { readFile } from 'fs/promises';
import fg from 'fast-glob';
import chalk from 'chalk';
import {
  parseDetectionFile,
  validateDetection,
  NanosiemClient,
  detectionToApiPayload,
  type Detection,
  type DetectionRule,
} from '@nanodac/core';
import { requireConfig, getApiKey } from '../config.js';

interface DiffOptions {
  verbose?: boolean;
}

export async function diffCommand(options: DiffOptions): Promise<void> {
  const config = await requireConfig();
  const apiKey = getApiKey();

  const client = new NanosiemClient({
    apiUrl: config.apiUrl,
    searchUrl: config.searchUrl,
    apiKey,
  });

  console.log(chalk.bold('\nComparing local and remote detections...\n'));

  // Load local detections
  const detectionsDir = config.detectionsDir;
  const patterns = [`${detectionsDir}/**/*.yaml`, `${detectionsDir}/**/*.yml`];
  const filePaths = await fg.glob(patterns);

  const localDetections = new Map<string, Detection>();
  for (const filePath of filePaths) {
    const content = await readFile(filePath, 'utf-8');
    const parseResult = parseDetectionFile(content, filePath);
    if (parseResult.success) {
      const validation = validateDetection(parseResult.detection!);
      if (validation.valid) {
        const detection = parseResult.detection!;
        localDetections.set(detection.metadata.title, detection);
      }
    }
  }

  // Fetch remote detections
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

  console.log(`Local: ${localDetections.size} detection(s)`);
  console.log(`Remote: ${remoteDetections.size} detection(s)\n`);

  let hasChanges = false;

  // Only in local (will be created)
  const localOnly: string[] = [];
  for (const name of localDetections.keys()) {
    if (!remoteDetections.has(name)) {
      localOnly.push(name);
    }
  }

  if (localOnly.length > 0) {
    hasChanges = true;
    console.log(chalk.green(`New (local only): ${localOnly.length}`));
    for (const name of localOnly) {
      console.log(chalk.green(`  + ${name}`));
    }
    console.log('');
  }

  // Only in remote (will be deleted if orphan deletion enabled)
  const remoteOnly: string[] = [];
  for (const name of remoteDetections.keys()) {
    if (!localDetections.has(name)) {
      remoteOnly.push(name);
    }
  }

  if (remoteOnly.length > 0) {
    hasChanges = true;
    console.log(chalk.red(`Remote only (orphaned): ${remoteOnly.length}`));
    for (const name of remoteOnly) {
      console.log(chalk.red(`  - ${name}`));
    }
    console.log('');
  }

  // Modified
  const modified: Array<{ name: string; changes: string[] }> = [];
  for (const [name, local] of localDetections) {
    const remote = remoteDetections.get(name);
    if (remote) {
      const changes = getChanges(local, remote);
      if (changes.length > 0) {
        modified.push({ name, changes });
      }
    }
  }

  if (modified.length > 0) {
    hasChanges = true;
    console.log(chalk.yellow(`Modified: ${modified.length}`));
    for (const item of modified) {
      console.log(chalk.yellow(`  ~ ${item.name}`));
      if (options.verbose) {
        for (const change of item.changes) {
          console.log(chalk.gray(`      ${change}`));
        }
      }
    }
    console.log('');
  }

  // Summary
  const unchanged =
    localDetections.size - localOnly.length - modified.length;
  if (unchanged > 0) {
    console.log(chalk.gray(`Unchanged: ${unchanged}`));
    console.log('');
  }

  if (!hasChanges) {
    console.log(chalk.green('No differences found\n'));
  }
}

function getChanges(local: Detection, remote: DetectionRule): string[] {
  const changes: string[] = [];
  const localPayload = detectionToApiPayload(local);

  if (localPayload.query !== remote.query) {
    changes.push('query changed');
  }
  if (localPayload.severity !== remote.severity) {
    changes.push(`severity: ${remote.severity} -> ${localPayload.severity}`);
  }
  if (localPayload.mode !== remote.mode) {
    changes.push(`mode: ${remote.mode} -> ${localPayload.mode}`);
  }
  if (localPayload.detection_mode !== remote.detection_mode) {
    changes.push(
      `detection_mode: ${remote.detection_mode} -> ${localPayload.detection_mode}`
    );
  }
  if (localPayload.description !== remote.description) {
    changes.push('description changed');
  }
  if (localPayload.schedule_cron !== remote.schedule_cron) {
    changes.push(
      `schedule: ${remote.schedule_cron || 'none'} -> ${localPayload.schedule_cron || 'none'}`
    );
  }

  // Compare arrays
  if (
    JSON.stringify(localPayload.mitre_tactics) !==
    JSON.stringify(remote.mitre_tactics)
  ) {
    changes.push('mitre_tactics changed');
  }
  if (
    JSON.stringify(localPayload.mitre_techniques) !==
    JSON.stringify(remote.mitre_techniques)
  ) {
    changes.push('mitre_techniques changed');
  }
  if (JSON.stringify(localPayload.tags) !== JSON.stringify(remote.tags)) {
    changes.push('tags changed');
  }

  // Compare AI triage hints
  if (
    JSON.stringify(localPayload.ai_triage_hints) !==
    JSON.stringify(remote.ai_triage_hints)
  ) {
    changes.push('ai_triage_hints changed');
  }

  // Compare additional fields
  if (localPayload.alert_mode !== remote.alert_mode) {
    changes.push(
      `alert_mode: ${remote.alert_mode || 'grouped'} -> ${localPayload.alert_mode || 'grouped'}`
    );
  }
  if (localPayload.reference_url !== remote.reference_url) {
    changes.push('reference_url changed');
  }
  if (localPayload.author !== remote.author) {
    changes.push(
      `author: ${remote.author || 'none'} -> ${localPayload.author || 'none'}`
    );
  }
  if (localPayload.realtime_enabled !== remote.realtime_enabled) {
    changes.push(
      `realtime_enabled: ${remote.realtime_enabled} -> ${localPayload.realtime_enabled}`
    );
  }
  if (localPayload.case_visibility !== remote.case_visibility) {
    changes.push(
      `case_visibility: ${remote.case_visibility || 'public'} -> ${localPayload.case_visibility || 'public'}`
    );
  }
  if (localPayload.folder !== remote.folder) {
    changes.push(
      `folder: ${remote.folder || 'none'} -> ${localPayload.folder || 'none'}`
    );
  }
  if (
    JSON.stringify(localPayload.case_group_ids) !==
    JSON.stringify(remote.case_group_ids)
  ) {
    changes.push('case_group_ids changed');
  }
  if (localPayload.auto_tuning_enabled !== remote.auto_tuning_enabled) {
    changes.push(
      `auto_tuning_enabled: ${remote.auto_tuning_enabled} -> ${localPayload.auto_tuning_enabled}`
    );
  }
  if (
    localPayload.auto_tuning_min_confidence !==
    remote.auto_tuning_min_confidence
  ) {
    changes.push('auto_tuning_min_confidence changed');
  }
  if (localPayload.auto_tuning_critical !== remote.auto_tuning_critical) {
    changes.push(
      `auto_tuning_critical: ${remote.auto_tuning_critical} -> ${localPayload.auto_tuning_critical}`
    );
  }

  return changes;
}
