/**
 * nanodac repo command
 *
 * Manage external rule repositories (Sigma rule sources)
 */

import chalk from 'chalk';
import { NanosiemClient } from '@nano-rs/dac-core';
import { requireConfig, getApiKey } from '../config.js';

// API response types
interface RuleRepository {
  id: string;
  name: string;
  slug: string;
  url: string;
  branch: string;
  description?: string;
  rule_count: number;
  last_sync_status?: string;
}

interface SyncResult {
  rules_added: number;
  rules_updated: number;
  rules_removed: number;
  rules_total: number;
  conversion_succeeded: number;
  conversion_failed: number;
}

interface RepositoryRule {
  file_path: string;
  title?: string;
  severity?: string;
  conversion_status?: string;
  coverage_status?: string;
}

interface ImportPreview {
  proposed_name: string;
  proposed_severity: string;
  conversion_status: string;
  conversion_confidence: number;
  coverage_status?: string;
  missing_fields: string[];
  conversion_warnings: string[];
  already_imported: boolean;
  existing_import_type?: string;
}

interface ImportResult {
  detection_rule_id: string;
  import_type: string;
}

interface RepoAddOptions {
  name: string;
  url: string;
  description?: string;
  branch?: string;
  rulesPath?: string;
  autoSync?: boolean;
}

interface RepoSyncOptions {
  name: string;
}

interface RepoBrowseOptions {
  name: string;
  path?: string;
  severity?: string;
  coverage?: string;
  limit?: number;
}

interface RepoImportOptions {
  repository: string;
  path: string;
  linked?: boolean;
  folder?: string;
}

async function getClient(): Promise<NanosiemClient> {
  const config = await requireConfig();
  const apiKey = getApiKey();
  return new NanosiemClient({
    apiUrl: config.apiUrl,
    searchUrl: config.searchUrl,
    apiKey,
  });
}

/**
 * List all configured rule repositories
 */
export async function repoListCommand(): Promise<void> {
  const client = await getClient();

  console.log(chalk.bold('\nRule Repositories\n'));

  const response = await fetch(`${(client as any).apiUrl}/api/rule-repositories`, {
    headers: {
      'Authorization': `Bearer ${(client as any).apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(chalk.red(`Failed to fetch repositories: ${response.statusText}`));
    process.exit(1);
  }

  const data = await response.json() as { repositories: any[] };
  const repos = data.repositories;

  if (repos.length === 0) {
    console.log(chalk.gray('No repositories configured.'));
    console.log(chalk.gray('Use `nanodac repo add` to add a repository.\n'));
    return;
  }

  for (const repo of repos) {
    const syncStatus = repo.last_sync_status === 'success'
      ? chalk.green('synced')
      : repo.last_sync_status === 'failed'
      ? chalk.red('failed')
      : chalk.gray('not synced');

    console.log(`${chalk.bold(repo.name)} ${chalk.gray(`(${repo.slug})`)}`);
    console.log(`  URL: ${repo.url}`);
    console.log(`  Branch: ${repo.branch}`);
    console.log(`  Rules: ${repo.rule_count} | Status: ${syncStatus}`);
    if (repo.description) {
      console.log(`  ${chalk.gray(repo.description)}`);
    }
    console.log('');
  }
}

/**
 * Add a new rule repository
 */
export async function repoAddCommand(options: RepoAddOptions): Promise<void> {
  const client = await getClient();

  console.log(chalk.bold(`\nAdding repository: ${options.name}\n`));

  const body = {
    name: options.name,
    url: options.url,
    description: options.description,
    branch: options.branch || 'main',
    rules_path: options.rulesPath || 'rules/',
    auto_sync_enabled: options.autoSync || false,
  };

  const response = await fetch(`${(client as any).apiUrl}/api/rule-repositories`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${(client as any).apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(chalk.red(`Failed to add repository: ${error}`));
    process.exit(1);
  }

  const addedRepo = await response.json() as RuleRepository;
  console.log(chalk.green(`Repository added: ${addedRepo.name}`));
  console.log(`  ID: ${addedRepo.id}`);
  console.log(`  Slug: ${addedRepo.slug}`);
  console.log('');
  console.log(chalk.gray('Run `nanodac repo sync ' + addedRepo.name + '` to fetch rules.\n'));
}

/**
 * Sync a repository to fetch/update rules
 */
export async function repoSyncCommand(options: RepoSyncOptions): Promise<void> {
  const client = await getClient();

  console.log(chalk.bold(`\nSyncing repository: ${options.name}\n`));

  // First, find the repository by name
  const listResponse = await fetch(`${(client as any).apiUrl}/api/rule-repositories`, {
    headers: {
      'Authorization': `Bearer ${(client as any).apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!listResponse.ok) {
    console.error(chalk.red(`Failed to fetch repositories: ${listResponse.statusText}`));
    process.exit(1);
  }

  const data = await listResponse.json() as { repositories: RuleRepository[] };
  const repo = data.repositories.find(
    (r) => r.name === options.name || r.slug === options.name
  );

  if (!repo) {
    console.error(chalk.red(`Repository not found: ${options.name}`));
    process.exit(1);
  }

  console.log(`Syncing ${repo.name} from ${repo.url}...`);

  const syncResponse = await fetch(
    `${(client as any).apiUrl}/api/rule-repositories/${repo.id}/sync`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(client as any).apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!syncResponse.ok) {
    const error = await syncResponse.text();
    console.error(chalk.red(`Sync failed: ${error}`));
    process.exit(1);
  }

  const result = await syncResponse.json() as SyncResult;
  console.log('');
  console.log(chalk.green('Sync complete!'));
  console.log(`  Rules added: ${chalk.green(String(result.rules_added))}`);
  console.log(`  Rules updated: ${chalk.yellow(String(result.rules_updated))}`);
  console.log(`  Rules removed: ${chalk.red(String(result.rules_removed))}`);
  console.log(`  Total rules: ${result.rules_total}`);
  if (result.conversion_succeeded > 0 || result.conversion_failed > 0) {
    console.log(`  Conversions: ${chalk.green(String(result.conversion_succeeded))} succeeded, ${chalk.red(String(result.conversion_failed))} failed`);
  }
  console.log('');
}

/**
 * Browse rules in a repository
 */
export async function repoBrowseCommand(options: RepoBrowseOptions): Promise<void> {
  const client = await getClient();

  // Find the repository
  const listResponse = await fetch(`${(client as any).apiUrl}/api/rule-repositories`, {
    headers: {
      'Authorization': `Bearer ${(client as any).apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!listResponse.ok) {
    console.error(chalk.red(`Failed to fetch repositories: ${listResponse.statusText}`));
    process.exit(1);
  }

  const browseData = await listResponse.json() as { repositories: RuleRepository[] };
  const browseRepo = browseData.repositories.find(
    (r) => r.name === options.name || r.slug === options.name
  );

  if (!browseRepo) {
    console.error(chalk.red(`Repository not found: ${options.name}`));
    process.exit(1);
  }

  // Build query params
  const params = new URLSearchParams();
  if (options.path) params.set('path_prefix', options.path);
  if (options.severity) params.set('severity', options.severity);
  if (options.coverage) params.set('coverage_status', options.coverage);
  if (options.limit) params.set('limit', String(options.limit));

  const query = params.toString();
  const rulesResponse = await fetch(
    `${(client as any).apiUrl}/api/rule-repositories/${browseRepo.id}/rules${query ? `?${query}` : ''}`,
    {
      headers: {
        'Authorization': `Bearer ${(client as any).apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!rulesResponse.ok) {
    const error = await rulesResponse.text();
    console.error(chalk.red(`Failed to fetch rules: ${error}`));
    process.exit(1);
  }

  const rules = await rulesResponse.json() as RepositoryRule[];

  console.log(chalk.bold(`\nRules in ${browseRepo.name}`));
  if (options.path) console.log(chalk.gray(`Path: ${options.path}`));
  console.log('');

  if (rules.length === 0) {
    console.log(chalk.gray('No rules found matching criteria.'));
    console.log('');
    return;
  }

  // Group by folder
  const byFolder = new Map<string, any[]>();
  for (const rule of rules) {
    const parts = rule.file_path.split('/');
    const folder = parts.slice(0, -1).join('/') || '/';
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(rule);
  }

  for (const [folder, folderRules] of byFolder) {
    console.log(chalk.blue(`${folder}/`));
    for (const rule of folderRules) {
      const severityColor = getSeverityColor(rule.severity);
      const conversionIcon = rule.conversion_status === 'success' ? chalk.green('✓') :
                             rule.conversion_status === 'failed' ? chalk.red('✗') :
                             chalk.gray('○');
      const coverageIcon = rule.coverage_status === 'full' ? chalk.green('●') :
                           rule.coverage_status === 'partial' ? chalk.yellow('◐') :
                           chalk.gray('○');

      const fileName = rule.file_path.split('/').pop();
      console.log(`  ${conversionIcon} ${coverageIcon} ${severityColor(rule.severity?.padEnd(8) || '        ')} ${rule.title || fileName}`);
    }
    console.log('');
  }

  console.log(chalk.gray(`Total: ${rules.length} rules\n`));
}

/**
 * Import a rule from a repository
 */
export async function repoImportCommand(options: RepoImportOptions): Promise<void> {
  const client = await getClient();

  // Find the repository
  const listResponse = await fetch(`${(client as any).apiUrl}/api/rule-repositories`, {
    headers: {
      'Authorization': `Bearer ${(client as any).apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!listResponse.ok) {
    console.error(chalk.red(`Failed to fetch repositories: ${listResponse.statusText}`));
    process.exit(1);
  }

  const importData = await listResponse.json() as { repositories: RuleRepository[] };
  const importRepo = importData.repositories.find(
    (r) => r.name === options.repository || r.slug === options.repository
  );

  if (!importRepo) {
    console.error(chalk.red(`Repository not found: ${options.repository}`));
    process.exit(1);
  }

  console.log(chalk.bold(`\nImporting rule: ${options.path}\n`));

  // Get preview first
  const previewResponse = await fetch(
    `${(client as any).apiUrl}/api/rule-repositories/${importRepo.id}/rules/preview/${encodeURIComponent(options.path)}`,
    {
      headers: {
        'Authorization': `Bearer ${(client as any).apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!previewResponse.ok) {
    const error = await previewResponse.text();
    console.error(chalk.red(`Failed to preview rule: ${error}`));
    process.exit(1);
  }

  const preview = await previewResponse.json() as ImportPreview;

  console.log(`Title: ${preview.proposed_name}`);
  console.log(`Severity: ${preview.proposed_severity}`);
  console.log(`Conversion: ${preview.conversion_status} (${(preview.conversion_confidence * 100).toFixed(0)}% confidence)`);
  console.log(`Coverage: ${preview.coverage_status || 'unknown'}`);

  if (preview.missing_fields.length > 0) {
    console.log(chalk.yellow(`\nMissing fields: ${preview.missing_fields.join(', ')}`));
  }

  if (preview.conversion_warnings.length > 0) {
    console.log(chalk.yellow('\nWarnings:'));
    for (const warning of preview.conversion_warnings) {
      console.log(chalk.yellow(`  - ${warning}`));
    }
  }

  if (preview.already_imported) {
    console.log(chalk.yellow(`\nNote: This rule has already been imported as ${preview.existing_import_type}`));
  }

  console.log('');

  // Perform import
  const importType = options.linked !== false ? 'linked' : 'forked';
  const importResponse = await fetch(
    `${(client as any).apiUrl}/api/rule-repositories/${importRepo.id}/rules/import/${encodeURIComponent(options.path)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(client as any).apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        import_type: importType,
        folder: options.folder,
      }),
    }
  );

  if (!importResponse.ok) {
    const error = await importResponse.text();
    console.error(chalk.red(`Import failed: ${error}`));
    process.exit(1);
  }

  const importResult = await importResponse.json() as ImportResult;
  console.log(chalk.green('Rule imported successfully!'));
  console.log(`  Detection ID: ${importResult.detection_rule_id}`);
  console.log(`  Import type: ${importResult.import_type}`);
  console.log('');
}

function getSeverityColor(severity: string | null): (text: string) => string {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return chalk.red;
    case 'high':
      return chalk.hex('#FFA500'); // orange
    case 'medium':
      return chalk.yellow;
    case 'low':
      return chalk.blue;
    case 'informational':
      return chalk.gray;
    default:
      return chalk.gray;
  }
}
