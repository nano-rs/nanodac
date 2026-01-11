/**
 * MCP Tools for NanoSIEM detection management
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  parseDetectionFile,
  validateDetection,
  NanosiemClient,
  detectionToApiPayload,
} from '@nanodac/core';

/** Tool definitions */
export const TOOLS = [
  {
    name: 'list_detections',
    description: 'List all detection rules from NanoSIEM',
    inputSchema: {
      type: 'object' as const,
      properties: {
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low', 'informational'],
          description: 'Filter by severity',
        },
        enabled: {
          type: 'boolean',
          description: 'Filter by enabled status',
        },
        mode: {
          type: 'string',
          enum: ['staging', 'live', 'alerting'],
          description: 'Filter by rule mode',
        },
      },
    },
  },
  {
    name: 'get_detection',
    description: 'Get a single detection rule by ID or name',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'Detection ID (UUID)',
        },
        name: {
          type: 'string',
          description: 'Detection name (alternative to ID)',
        },
      },
    },
  },
  {
    name: 'create_detection',
    description: 'Create a new detection rule from YAML content',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Detection file content (YAML frontmatter + query)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'update_detection',
    description: 'Update an existing detection rule',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'Detection ID to update',
        },
        content: {
          type: 'string',
          description: 'New detection file content',
        },
      },
      required: ['id', 'content'],
    },
  },
  {
    name: 'validate_detection',
    description: 'STEP 6a of new detection workflow: Validate detection syntax and schema before committing.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Detection file content to validate',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'test_detection',
    description: 'STEP 6b of new detection workflow: Test the detection query against historical data to verify it works.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Detection query to test',
        },
        days: {
          type: 'number',
          description: 'Days of historical data (default: 7)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search',
    description: 'Execute a search query against NanoSIEM logs',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (SPL-like piped syntax)',
        },
        start_time: {
          type: 'string',
          description: 'Start time (ISO 8601 or relative like "-24h")',
        },
        end_time: {
          type: 'string',
          description: 'End time (ISO 8601 or "now")',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 100)',
        },
      },
      required: ['query', 'start_time', 'end_time'],
    },
  },
  {
    name: 'generate_hints',
    description: 'Generate AI triage hints for a detection based on recent alerts',
    inputSchema: {
      type: 'object' as const,
      properties: {
        detection_id: {
          type: 'string',
          description: 'Detection ID to generate hints for',
        },
      },
      required: ['detection_id'],
    },
  },
  {
    name: 'get_schema',
    description: 'STEP 4 of new detection workflow: Get the detection file schema and example format before writing a detection.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'create_issue',
    description: 'STEP 2 of new detection workflow: Create a GitHub issue to track the new detection. Save the issue number for linking to PR later.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Issue title (e.g., "Tune brute_force_ssh - false positives from scanners")',
        },
        body: {
          type: 'string',
          description: 'Issue description with details about the problem',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels for categorization (e.g., ["detection", "tuning", "false-positive"])',
        },
        assignee: {
          type: 'string',
          description: 'GitHub username to assign the issue to',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_issues',
    description: 'List GitHub issues in the current repository',
    inputSchema: {
      type: 'object' as const,
      properties: {
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter by issue state (default: open)',
        },
        labels: {
          type: 'string',
          description: 'Filter by labels (comma-separated)',
        },
        limit: {
          type: 'number',
          description: 'Maximum issues to return (default: 20)',
        },
      },
    },
  },
  // Git workflow tools
  {
    name: 'create_branch',
    description: 'STEP 3 of new detection workflow: Create a feature branch for the new detection (e.g., detect/powershell-encoded-commands).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        branch_name: {
          type: 'string',
          description: 'Branch name (e.g., "detect/powershell-encoded-commands")',
        },
        base: {
          type: 'string',
          description: 'Base branch to create from (default: main)',
        },
      },
      required: ['branch_name'],
    },
  },
  {
    name: 'write_detection_file',
    description: 'STEP 5 of new detection workflow: Write the detection YAML file to the detections/ folder.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filename: {
          type: 'string',
          description: 'Filename relative to detections/ (e.g., "malware/encoded_powershell.yaml")',
        },
        content: {
          type: 'string',
          description: 'Full detection file content (YAML frontmatter + query)',
        },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'commit_and_push',
    description: 'STEP 7 of new detection workflow (after user approval): Commit the detection file and push to remote.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'Commit message',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to commit (relative to repo root)',
        },
      },
      required: ['message', 'files'],
    },
  },
  {
    name: 'create_pull_request',
    description: 'STEP 8 of new detection workflow (final step): Create a PR linking to the issue. Issue auto-closes on merge.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'PR title',
        },
        body: {
          type: 'string',
          description: 'PR body/description',
        },
        issue_number: {
          type: 'number',
          description: 'Issue number to link (will be closed on merge)',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to add (e.g., ["awaiting-review", "detection"])',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR (default: false)',
        },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'get_current_branch',
    description: 'Get the current git branch name',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'sync_repo',
    description: 'STEP 1 of new detection workflow: Sync the repository before starting any new detection. Stashes uncommitted changes, checks out main, pulls latest.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        base_branch: {
          type: 'string',
          description: 'Base branch to sync (default: main)',
        },
      },
    },
  },
];

/** Get NanoSIEM client from environment */
function getClient(): NanosiemClient {
  const apiUrl = process.env.NANOSIEM_API_URL;
  const searchUrl = process.env.NANOSIEM_SEARCH_URL;
  const apiKey = process.env.NANOSIEM_API_KEY;

  if (!apiUrl) {
    throw new Error('NANOSIEM_API_URL environment variable is required');
  }
  if (!apiKey) {
    throw new Error('NANOSIEM_API_KEY environment variable is required');
  }

  return new NanosiemClient({ apiUrl, searchUrl, apiKey });
}

/**
 * Check if a query might produce sparse/unhelpful alert output
 * Returns warnings if the query uses stats without meaningful context fields
 */
function checkAlertOutputQuality(query: string): string[] {
  const warnings: string[] = [];
  const lowerQuery = query.toLowerCase();

  // Check if query uses stats
  if (lowerQuery.includes('| stats ') || lowerQuery.includes('|stats ')) {
    // Look for good patterns - contextual aggregations
    const hasTimeContext = /min\s*\(\s*timestamp\s*\)|max\s*\(\s*timestamp\s*\)|first_seen|last_seen/i.test(query);
    const hasValuesAgg = /values\s*\(/i.test(query);
    const hasListAgg = /list\s*\(/i.test(query);

    // Check what fields are in the stats output
    const statsMatch = query.match(/\|\s*stats\s+(.+?)(?:\||$)/is);
    if (statsMatch) {
      const statsClause = statsMatch[1];

      // Count how many output fields we have (rough heuristic)
      const byMatch = statsClause.match(/\s+by\s+(.+?)$/i);
      const aggregations = statsClause.replace(/\s+by\s+.+$/i, '');

      // Simple count-only detection
      const isSimpleCount = /^\s*count\s*\(\s*\)\s*(as\s+\w+)?\s*$/i.test(aggregations.trim());

      if (isSimpleCount && !hasValuesAgg && !hasListAgg) {
        warnings.push(
          'Alert output may lack context: query uses simple count() without contextual fields. ' +
          'Consider adding: values(user), values(dest_host), min(timestamp), max(timestamp) ' +
          'so analysts can investigate without running additional queries.'
        );
      } else if (!hasTimeContext && !hasValuesAgg && !hasListAgg) {
        warnings.push(
          'Consider adding time context to alerts: min(timestamp) as first_seen, max(timestamp) as last_seen ' +
          'helps analysts understand the attack timeline.'
        );
      }
    }
  }

  return warnings;
}

/** Parse relative time to ISO string */
function parseRelativeTime(time: string): string {
  if (time === 'now') {
    return new Date().toISOString();
  }

  // Check for relative format like "-24h", "-7d"
  const match = time.match(/^-(\d+)(h|d|m)$/);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const now = new Date();

    switch (unit) {
      case 'm':
        now.setMinutes(now.getMinutes() - value);
        break;
      case 'h':
        now.setHours(now.getHours() - value);
        break;
      case 'd':
        now.setDate(now.getDate() - value);
        break;
    }

    return now.toISOString();
  }

  // Assume ISO format
  return time;
}

/** Handle tool calls */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const client = getClient();

  try {
    switch (name) {
      case 'list_detections': {
        const result = await client.listDetections();
        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error?.message}` }],
            isError: true,
          };
        }

        let detections = result.data!;

        // Apply filters
        if (args.severity) {
          detections = detections.filter((d) => d.severity === args.severity);
        }
        if (args.enabled !== undefined) {
          detections = detections.filter((d) => d.enabled === args.enabled);
        }
        if (args.mode) {
          detections = detections.filter((d) => d.mode === args.mode);
        }

        // Return summary
        const summary = detections.map((d) => ({
          id: d.id,
          name: d.name,
          severity: d.severity,
          mode: d.mode,
          enabled: d.enabled,
          match_count: d.match_count,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        };
      }

      case 'get_detection': {
        if (args.id) {
          const result = await client.getDetection(args.id as string);
          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error?.message}` }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          };
        }

        if (args.name) {
          const listResult = await client.listDetections();
          if (!listResult.success) {
            return {
              content: [{ type: 'text', text: `Error: ${listResult.error?.message}` }],
              isError: true,
            };
          }
          const detection = listResult.data!.find(
            (d) => d.name === args.name
          );
          if (!detection) {
            return {
              content: [{ type: 'text', text: `Detection not found: ${args.name}` }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(detection, null, 2) }],
          };
        }

        return {
          content: [{ type: 'text', text: 'Either id or name is required' }],
          isError: true,
        };
      }

      case 'create_detection': {
        const parseResult = parseDetectionFile(args.content as string, 'input.yaml');
        if (!parseResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Parse errors:\n${parseResult.errors.map((e) => e.message).join('\n')}`,
              },
            ],
            isError: true,
          };
        }

        const validation = validateDetection(parseResult.detection!);
        if (!validation.valid) {
          return {
            content: [
              {
                type: 'text',
                text: `Validation errors:\n${validation.errors.map((e) => `${e.field}: ${e.message}`).join('\n')}`,
              },
            ],
            isError: true,
          };
        }

        // Check alert output quality
        const outputWarnings = checkAlertOutputQuality(parseResult.detection!.query);

        const payload = detectionToApiPayload(parseResult.detection!);
        const result = await client.createDetection(payload);

        if (result.success) {
          let message = `Created detection: ${result.data!.id}\nName: ${result.data!.name}`;
          if (result.data?.warning) {
            message += `\nAPI Warning: ${result.data.warning}`;
          }
          if (outputWarnings.length > 0) {
            message += `\n\n⚠️ Alert Quality Warnings:\n${outputWarnings.map(w => `- ${w}`).join('\n')}`;
          }
          return { content: [{ type: 'text', text: message }] };
        } else {
          return {
            content: [{ type: 'text', text: `Error: ${result.error?.message}` }],
            isError: true,
          };
        }
      }

      case 'update_detection': {
        const parseResult = parseDetectionFile(args.content as string, 'input.yaml');
        if (!parseResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Parse errors:\n${parseResult.errors.map((e) => e.message).join('\n')}`,
              },
            ],
            isError: true,
          };
        }

        const validation = validateDetection(parseResult.detection!);
        if (!validation.valid) {
          return {
            content: [
              {
                type: 'text',
                text: `Validation errors:\n${validation.errors.map((e) => `${e.field}: ${e.message}`).join('\n')}`,
              },
            ],
            isError: true,
          };
        }

        const payload = detectionToApiPayload(parseResult.detection!);
        const result = await client.updateDetection(args.id as string, payload);

        if (result.success) {
          let message = `Updated detection: ${result.data!.id}`;
          if (result.data?.warning) {
            message += `\nWarning: ${result.data.warning}`;
          }
          return { content: [{ type: 'text', text: message }] };
        } else {
          return {
            content: [{ type: 'text', text: `Error: ${result.error?.message}` }],
            isError: true,
          };
        }
      }

      case 'validate_detection': {
        const parseResult = parseDetectionFile(args.content as string, 'input.yaml');
        if (!parseResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { valid: false, parseErrors: parseResult.errors },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const validation = validateDetection(parseResult.detection!);
        const outputWarnings = checkAlertOutputQuality(parseResult.detection!.query);

        const result = {
          ...validation,
          alertOutputWarnings: outputWarnings.length > 0 ? outputWarnings : undefined,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'test_detection': {
        const result = await client.testQuery(
          args.query as string,
          (args.days as number) ?? 7
        );

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error?.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case 'search': {
        const startTime = parseRelativeTime(args.start_time as string);
        const endTime = parseRelativeTime(args.end_time as string);

        const result = await client.search(
          args.query as string,
          { start: startTime, end: endTime },
          { limit: (args.limit as number) ?? 100 }
        );

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error?.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case 'generate_hints': {
        // This would call the meloD API endpoint for hint generation
        // For now, return a placeholder
        return {
          content: [
            {
              type: 'text',
              text: `Hint generation for detection ${args.detection_id} requires meloD API integration. Please use the NanoSIEM UI for now.`,
            },
          ],
        };
      }

      case 'get_schema': {
        const schema = `# NanoSIEM Detection File Format

A detection file uses YAML frontmatter followed by a query.

## Required Fields
- title: Snake_case identifier (e.g., suspicious_powershell_execution)
- description: What the detection identifies
- severity: critical | high | medium | low | informational
- query: NanoSIEM piped query syntax

## Optional Fields
- author: Detection author name
- mode: staging | live | alerting (default: staging)
- detection_mode: scheduled | real-time (default: scheduled)
- schedule: Cron expression (e.g., "*/5 * * * *")
- lookback: Time window (e.g., "15m", "1h", "24h")
- mitre_tactics: MITRE ATT&CK tactic ID (e.g., "TA0011")
- mitre_techniques: MITRE ATT&CK technique ID (e.g., "T1071")
- risk_score: Number 0-100 or "auto"
- risk_entity: Field name for risk scoring or "auto-detect"
- tags: Array of category tags
- reference_url: URL with more information
- ai_triage_hints: Object with ignore_when, suspicious_when, context

## Query Syntax
source_type=<log_source>
  | where <condition>
  | stats count() by <field>
  | where count > <threshold>

## Available Commands
- where: Filter events (e.g., where status_code >= 400)
- stats: Aggregate (e.g., stats count() by src_ip)
- timechart: Time-based aggregation
- table: Select specific fields
- sort: Order results
- head/tail: Limit results
- prevalence: Enrich with prevalence data
- lookup: Join with lookup tables

## Example Detection
\`\`\`yaml
---
title: high_failed_login_attempts
description: Detects brute force attacks via excessive failed logins
author: security_team
severity: high
mode: staging
detection_mode: scheduled
schedule: "*/5 * * * *"
lookback: 15m
mitre_tactics: TA0006
mitre_techniques: T1110
risk_score: auto
risk_entity: src_ip
tags:
  - authentication
  - brute_force
ai_triage_hints:
  ignore_when:
    - "Source IP is from known scanner (e.g., security tools)"
    - "User is a service account with expected auth patterns"
  suspicious_when:
    - "Multiple usernames targeted from same IP"
    - "Activity occurs outside business hours"
  context: "Failed logins can be normal but excessive attempts from one source often indicate brute force."
---
source_type=auth_logs
  | where action="login_failed"
  | stats count() as failed_attempts by src_ip, user
  | where failed_attempts > 10
\`\`\``;

        return {
          content: [{ type: 'text', text: schema }],
        };
      }

      case 'create_issue': {
        // Use gh CLI to create GitHub issue
        const { execSync } = await import('child_process');

        try {
          // Check if gh is available
          execSync('gh --version', { stdio: 'ignore' });
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: 'GitHub CLI (gh) is not installed or not authenticated.\nInstall from: https://cli.github.com/',
              },
            ],
            isError: true,
          };
        }

        const ghArgs = ['issue', 'create', '--title', args.title as string];

        if (args.body) {
          ghArgs.push('--body', args.body as string);
        }

        if (args.labels && Array.isArray(args.labels)) {
          for (const label of args.labels as string[]) {
            ghArgs.push('--label', label);
          }
        }

        if (args.assignee) {
          ghArgs.push('--assignee', args.assignee as string);
        }

        try {
          const result = execSync(`gh ${ghArgs.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`, {
            encoding: 'utf-8',
          });

          return {
            content: [
              {
                type: 'text',
                text: `GitHub issue created successfully!\n\n${result.trim()}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to create issue: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'list_issues': {
        const { execSync } = await import('child_process');

        try {
          execSync('gh --version', { stdio: 'ignore' });
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: 'GitHub CLI (gh) is not installed or not authenticated.\nInstall from: https://cli.github.com/',
              },
            ],
            isError: true,
          };
        }

        const ghArgs = ['issue', 'list', '--json', 'number,title,state,labels,url'];

        if (args.state) {
          ghArgs.push('--state', args.state as string);
        }

        if (args.labels) {
          ghArgs.push('--label', args.labels as string);
        }

        const limit = (args.limit as number) || 20;
        ghArgs.push('--limit', String(limit));

        try {
          const result = execSync(`gh ${ghArgs.join(' ')}`, { encoding: 'utf-8' });
          const issues = JSON.parse(result);

          if (issues.length === 0) {
            return {
              content: [{ type: 'text', text: 'No issues found.' }],
            };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to list issues: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Git workflow tools
      case 'create_branch': {
        const { execSync } = await import('child_process');

        try {
          const branchName = args.branch_name as string;
          const base = (args.base as string) || 'main';

          // Fetch latest and create branch
          execSync(`git fetch origin ${base}`, { encoding: 'utf-8', stdio: 'pipe' });
          execSync(`git checkout -b ${branchName} origin/${base}`, { encoding: 'utf-8', stdio: 'pipe' });

          return {
            content: [
              {
                type: 'text',
                text: `Created and switched to branch: ${branchName}\nBased on: origin/${base}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to create branch: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'write_detection_file': {
        const { writeFileSync, mkdirSync, existsSync } = await import('fs');
        const { dirname, join } = await import('path');

        try {
          const filename = args.filename as string;
          const content = args.content as string;

          // Determine detections directory (check for nanodac config or use default)
          const detectionsDir = process.env.NANODAC_DETECTIONS_DIR || 'detections';
          const filePath = join(detectionsDir, filename);
          const dir = dirname(filePath);

          // Create directory if needed
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          // Write the file
          writeFileSync(filePath, content, 'utf-8');

          return {
            content: [
              {
                type: 'text',
                text: `Detection file written: ${filePath}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'commit_and_push': {
        const { execSync } = await import('child_process');

        try {
          const message = args.message as string;
          const files = args.files as string[];

          // Add files
          for (const file of files) {
            execSync(`git add "${file}"`, { encoding: 'utf-8', stdio: 'pipe' });
          }

          // Commit
          execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
            encoding: 'utf-8',
            stdio: 'pipe',
          });

          // Push with upstream tracking
          const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf-8',
          }).trim();
          execSync(`git push -u origin ${branch}`, { encoding: 'utf-8', stdio: 'pipe' });

          return {
            content: [
              {
                type: 'text',
                text: `Committed and pushed:\n- Files: ${files.join(', ')}\n- Message: ${message}\n- Branch: ${branch}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to commit/push: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'create_pull_request': {
        const { execSync } = await import('child_process');

        try {
          const title = args.title as string;
          let body = args.body as string;
          const issueNumber = args.issue_number as number | undefined;
          const labels = args.labels as string[] | undefined;
          const draft = args.draft as boolean | undefined;

          // Add issue closing reference if provided
          if (issueNumber) {
            body = `${body}\n\nCloses #${issueNumber}`;
          }

          const ghArgs = ['pr', 'create', '--title', `"${title.replace(/"/g, '\\"')}"`, '--body', `"${body.replace(/"/g, '\\"')}"`];

          if (labels && labels.length > 0) {
            for (const label of labels) {
              ghArgs.push('--label', label);
            }
          }

          if (draft) {
            ghArgs.push('--draft');
          }

          const result = execSync(`gh ${ghArgs.join(' ')}`, { encoding: 'utf-8' });

          return {
            content: [
              {
                type: 'text',
                text: `Pull request created!\n${result.trim()}${issueNumber ? `\n\nLinked to issue #${issueNumber} (will close on merge)` : ''}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to create PR: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'get_current_branch': {
        const { execSync } = await import('child_process');

        try {
          const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf-8',
          }).trim();

          return {
            content: [{ type: 'text', text: branch }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get branch: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'sync_repo': {
        const { execSync } = await import('child_process');

        try {
          const baseBranch = (args.base_branch as string) || 'main';
          const results: string[] = [];

          // Check for uncommitted changes
          const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
          if (status) {
            // Stash any uncommitted changes
            execSync('git stash push -m "nanodac: auto-stash before sync"', {
              encoding: 'utf-8',
              stdio: 'pipe',
            });
            results.push('Stashed uncommitted changes');
          }

          // Get current branch
          const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf-8',
          }).trim();

          // Checkout base branch if not already on it
          if (currentBranch !== baseBranch) {
            execSync(`git checkout ${baseBranch}`, { encoding: 'utf-8', stdio: 'pipe' });
            results.push(`Switched to ${baseBranch}`);
          }

          // Pull latest
          execSync(`git pull origin ${baseBranch}`, { encoding: 'utf-8', stdio: 'pipe' });
          results.push(`Pulled latest from origin/${baseBranch}`);

          // Get latest commit for reference
          const latestCommit = execSync('git log -1 --oneline', { encoding: 'utf-8' }).trim();

          return {
            content: [
              {
                type: 'text',
                text: `Repository synced successfully!\n\n${results.join('\n')}\n\nLatest commit: ${latestCommit}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to sync repo: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
