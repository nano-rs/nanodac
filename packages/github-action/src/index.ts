/**
 * NanoDac GitHub Action
 *
 * Validates and deploys detection rules to NanoSIEM
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { readFile } from 'fs/promises';
import fg from 'fast-glob';
import {
  parseDetectionFile,
  validateDetection,
  NanosiemClient,
  detectionToApiPayload,
  type Detection,
  type DetectionRule,
} from '@nano-rs/dac-core';

interface ValidationEntry {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

async function run(): Promise<void> {
  try {
    // Get inputs
    const apiUrl = core.getInput('nanosiem-url', { required: true });
    const apiKey = core.getInput('api-key', { required: true });
    const searchUrl = core.getInput('search-url');
    const detectionsDir = core.getInput('detections-dir') || 'detections';
    const action = core.getInput('action') || 'both';
    const strict = core.getBooleanInput('strict');
    const dryRun = core.getBooleanInput('dry-run');
    const deleteOrphans = core.getBooleanInput('delete-orphans');
    const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN;

    const client = new NanosiemClient({ apiUrl, searchUrl, apiKey });

    // Find detection files
    const patterns = [`${detectionsDir}/**/*.yaml`, `${detectionsDir}/**/*.yml`];
    const filePaths = await fg.glob(patterns);

    core.info(`Found ${filePaths.length} detection file(s)`);

    // Parse and validate all files
    const validationResults: ValidationEntry[] = [];
    const validDetections = new Map<string, Detection>();

    for (const filePath of filePaths) {
      const content = await readFile(filePath, 'utf-8');
      const parseResult = parseDetectionFile(content, filePath);

      if (!parseResult.success) {
        validationResults.push({
          file: filePath,
          valid: false,
          errors: parseResult.errors.map((e) => e.message),
          warnings: [],
        });
        continue;
      }

      const validation = validateDetection(parseResult.detection!);
      const isValid = validation.valid && (!strict || validation.warnings.length === 0);

      validationResults.push({
        file: filePath,
        valid: isValid,
        errors: validation.errors.map((e) => `${e.field}: ${e.message}`),
        warnings: validation.warnings.map((w) => `${w.field}: ${w.message}`),
      });

      if (validation.valid) {
        validDetections.set(
          parseResult.detection!.metadata.title,
          parseResult.detection!
        );
      }
    }

    // Generate validation summary
    const failedCount = validationResults.filter((r) => !r.valid).length;
    const warningCount = validationResults.filter(
      (r) => r.warnings.length > 0
    ).length;

    core.setOutput('validation-result', failedCount === 0 ? 'valid' : 'invalid');

    // Log validation results
    for (const result of validationResults) {
      if (result.errors.length > 0) {
        core.error(`${result.file}: ${result.errors.join(', ')}`);
      }
      if (result.warnings.length > 0) {
        core.warning(`${result.file}: ${result.warnings.join(', ')}`);
      }
    }

    // Post PR comment if in a PR context
    if (githubToken && github.context.payload.pull_request) {
      await postPRComment(githubToken, validationResults);
    }

    // Stop if validation failed
    if (failedCount > 0 && (action === 'validate' || action === 'both')) {
      core.setFailed(`Validation failed for ${failedCount} file(s)`);
      return;
    }

    // Deploy if requested
    if (action === 'deploy' || action === 'both') {
      const syncResult = await syncDetections(
        client,
        validDetections,
        deleteOrphans,
        dryRun
      );

      core.setOutput('created-count', syncResult.created.toString());
      core.setOutput('updated-count', syncResult.updated.toString());
      core.setOutput('deleted-count', syncResult.deleted.toString());

      core.info(
        `Sync complete: ${syncResult.created} created, ${syncResult.updated} updated, ${syncResult.deleted} deleted`
      );
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

async function postPRComment(
  token: string,
  results: ValidationEntry[]
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const prNumber = github.context.payload.pull_request!.number;

  const failedResults = results.filter((r) => !r.valid);
  const warningResults = results.filter(
    (r) => r.valid && r.warnings.length > 0
  );
  const validCount = results.filter(
    (r) => r.valid && r.warnings.length === 0
  ).length;

  let body = '## Detection Validation Results\n\n';

  if (failedResults.length === 0 && warningResults.length === 0) {
    body += `All ${results.length} detection(s) passed validation.\n`;
  } else {
    body += `| Status | Count |\n|--------|-------|\n`;
    body += `| :white_check_mark: Valid | ${validCount} |\n`;
    body += `| :warning: Warnings | ${warningResults.length} |\n`;
    body += `| :x: Errors | ${failedResults.length} |\n\n`;

    if (failedResults.length > 0) {
      body += '### Errors\n\n';
      for (const result of failedResults) {
        body += `**${result.file}**\n`;
        for (const error of result.errors) {
          body += `- :x: ${error}\n`;
        }
        body += '\n';
      }
    }

    if (warningResults.length > 0) {
      body += '### Warnings\n\n';
      for (const result of warningResults) {
        body += `**${result.file}**\n`;
        for (const warning of result.warnings) {
          body += `- :warning: ${warning}\n`;
        }
        body += '\n';
      }
    }
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}

interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
}

/**
 * Detection-as-Code provenance for a detection (NAN-1764) so nano's tuning PRs
 * target the real file. In GitHub Actions the repo is checked out at the
 * workspace root and globbed with a relative pattern, so `filePath` is already
 * repo-root-relative; the repo URL comes from the runner env.
 */
function sourceProvenance(detection: Detection): {
  sourcePath: string;
  sourceRepoUrl?: string;
} {
  const sourcePath = detection.filePath.split('\\').join('/');
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repo = process.env.GITHUB_REPOSITORY;
  return {
    sourcePath,
    sourceRepoUrl: repo ? `${serverUrl}/${repo}` : undefined,
  };
}

async function syncDetections(
  client: NanosiemClient,
  localDetections: Map<string, Detection>,
  deleteOrphans: boolean,
  dryRun: boolean
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0 };

  // Fetch remote detections
  const remoteResult = await client.listDetections();
  if (!remoteResult.success) {
    throw new Error(`Failed to fetch remote detections: ${remoteResult.error?.message}`);
  }

  const remoteDetections = new Map<string, DetectionRule>();
  for (const rule of remoteResult.data!) {
    remoteDetections.set(rule.name, rule);
  }

  // Create new detections
  for (const [name, detection] of localDetections) {
    if (!remoteDetections.has(name)) {
      if (dryRun) {
        core.info(`[dry-run] Would create: ${name}`);
      } else {
        const payload = detectionToApiPayload(
          detection,
          sourceProvenance(detection)
        );
        const createResult = await client.createDetection(payload);
        if (createResult.success) {
          core.info(`Created: ${name}`);
          result.created++;
        } else {
          core.error(`Failed to create ${name}: ${createResult.error?.message}`);
        }
      }
    }
  }

  // Update existing detections
  for (const [name, detection] of localDetections) {
    const remote = remoteDetections.get(name);
    if (remote) {
      const payload = detectionToApiPayload(
        detection,
        sourceProvenance(detection)
      );

      // Simple comparison - check key fields
      if (needsUpdate(payload, remote)) {
        if (dryRun) {
          core.info(`[dry-run] Would update: ${name}`);
        } else {
          const updateResult = await client.updateDetection(remote.id, payload);
          if (updateResult.success) {
            core.info(`Updated: ${name}`);
            result.updated++;
          } else {
            core.error(`Failed to update ${name}: ${updateResult.error?.message}`);
          }
        }
      }
    }
  }

  // Delete orphaned detections
  if (deleteOrphans) {
    for (const [name, remote] of remoteDetections) {
      if (!localDetections.has(name)) {
        if (dryRun) {
          core.info(`[dry-run] Would delete: ${name}`);
        } else {
          const deleteResult = await client.deleteDetection(remote.id);
          if (deleteResult.success) {
            core.info(`Deleted: ${name}`);
            result.deleted++;
          } else {
            core.error(`Failed to delete ${name}: ${deleteResult.error?.message}`);
          }
        }
      }
    }
  }

  return result;
}

function needsUpdate(
  local: ReturnType<typeof detectionToApiPayload>,
  remote: DetectionRule
): boolean {
  if (local.query !== remote.query) return true;
  if (local.severity !== remote.severity) return true;
  if (local.mode !== remote.mode) return true;
  if (local.detection_mode !== remote.detection_mode) return true;
  if (local.description !== remote.description) return true;
  if (local.schedule_cron !== remote.schedule_cron) return true;
  if (
    JSON.stringify(local.ai_triage_hints) !==
    JSON.stringify(remote.ai_triage_hints)
  )
    return true;
  // NAN-1764: backfill/refresh DaC provenance. Only when the server echoes
  // source_path (null for nano-native rules); an older nano omits it, so keying
  // off `undefined` avoids churning every rule against a server that can't store it.
  if (
    remote.source_path !== undefined &&
    (remote.source_path ?? '') !== (local.source_path ?? '')
  )
    return true;
  return false;
}

run();
