/**
 * nanodac test command
 *
 * Tests a detection against historical data
 */

import { readFile } from 'fs/promises';
import chalk from 'chalk';
import {
  parseDetectionFile,
  validateDetection,
  NanosiemClient,
} from '@nanodac/core';
import { requireConfig, getApiKey } from '../config.js';

export interface TestOptions {
  days?: string;
  hours?: string;
  limit?: string;
  all?: boolean;
  fields?: string;
  compact?: boolean;
}

// Key fields to highlight in event output
const KEY_FIELDS = [
  'timestamp', 'source_type', 'src_ip', 'dest_ip', 'src_host', 'dest_host',
  'user', 'action', 'status', 'status_code', 'url', 'url_domain', 'file_path',
  'process_name', 'command_line', 'severity', 'message'
];

/**
 * Filter out null, empty, and uninteresting fields from an event
 */
function filterEvent(event: Record<string, unknown>, customFields?: string[]): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  const fieldsToShow = customFields || Object.keys(event);

  for (const key of fieldsToShow) {
    if (!(key in event)) continue;

    const value = event[key];

    // Skip null, undefined, empty strings, empty arrays, zeros (except status_code)
    if (value === null || value === undefined) continue;
    if (value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value === 0 && !['status_code', 'bytes_in', 'bytes_out', 'duration'].includes(key)) continue;

    // Skip internal fields unless explicitly requested
    if (key.startsWith('_') && !customFields) continue;
    if (key.startsWith('enriched_') && !customFields) continue;

    // Skip empty objects
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;

    filtered[key] = value;
  }

  return filtered;
}

/**
 * Format a single event for display
 */
function formatEvent(event: Record<string, unknown>, index: number, compact: boolean, customFields?: string[]): string {
  const lines: string[] = [];
  const filtered = filterEvent(event, customFields);

  lines.push(chalk.bold.blue(`\n─── Event ${index + 1} ───`));

  if (compact) {
    // Compact: show key fields on one line each
    const timestamp = filtered.timestamp || filtered.ingest_time;
    if (timestamp) {
      lines.push(`  ${chalk.gray('time:')} ${chalk.white(String(timestamp))}`);
    }

    // Source info
    const source = [filtered.src_ip, filtered.src_host, filtered.user].filter(Boolean).join(' | ');
    if (source) {
      lines.push(`  ${chalk.gray('source:')} ${chalk.cyan(source)}`);
    }

    // Destination info
    const dest = [filtered.dest_ip, filtered.dest_host, filtered.url_domain].filter(Boolean).join(' | ');
    if (dest) {
      lines.push(`  ${chalk.gray('dest:')} ${chalk.yellow(dest)}`);
    }

    // Action/status
    const action = [filtered.action, filtered.status, filtered.status_code].filter(Boolean).join(' ');
    if (action) {
      lines.push(`  ${chalk.gray('action:')} ${chalk.green(action)}`);
    }

    // URL or file path
    if (filtered.url) {
      lines.push(`  ${chalk.gray('url:')} ${chalk.white(String(filtered.url))}`);
    } else if (filtered.file_path) {
      lines.push(`  ${chalk.gray('path:')} ${chalk.white(String(filtered.file_path))}`);
    }

    // Command line if present
    if (filtered.command_line) {
      const cmd = String(filtered.command_line);
      lines.push(`  ${chalk.gray('cmd:')} ${chalk.white(cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd)}`);
    }

    // Message if present and different from other fields
    if (filtered.message && !filtered.url && !filtered.command_line) {
      const msg = String(filtered.message);
      lines.push(`  ${chalk.gray('msg:')} ${chalk.white(msg.length > 100 ? msg.slice(0, 97) + '...' : msg)}`);
    }
  } else if (customFields) {
    // Custom fields: show only requested fields in a simple list
    for (const [key, value] of Object.entries(filtered)) {
      lines.push(`  ${chalk.gray(key + ':')} ${formatValue(value)}`);
    }
  } else {
    // Full: show all non-null fields organized by category
    const categories: Record<string, string[]> = {
      'Time': ['timestamp', 'ingest_time', 'duration'],
      'Source': ['src_ip', 'src_host', 'src_port', 'src_user', 'src_mac', 'user', 'user_name'],
      'Destination': ['dest_ip', 'dest_host', 'dest_port', 'dest_user', 'dest_mac', 'url', 'url_domain', 'uri_path'],
      'Action': ['action', 'status', 'status_code', 'result', 'http_method', 'protocol'],
      'Process': ['process_name', 'process_path', 'process_id', 'command_line', 'parent_command_line'],
      'File': ['file_path', 'file_name', 'file_size', 'file_action'],
      'Network': ['bytes_in', 'bytes_out', 'packets_in', 'packets_out', 'direction'],
      'Other': [] // catch-all
    };

    const usedKeys = new Set<string>();

    for (const [category, fields] of Object.entries(categories)) {
      if (category === 'Other') continue;

      const categoryFields: string[] = [];
      for (const field of fields) {
        if (field in filtered && !usedKeys.has(field)) {
          categoryFields.push(`${chalk.gray(field + ':')} ${formatValue(filtered[field])}`);
          usedKeys.add(field);
        }
      }

      if (categoryFields.length > 0) {
        lines.push(`  ${chalk.bold(category)}`);
        for (const f of categoryFields) {
          lines.push(`    ${f}`);
        }
      }
    }

    // Show remaining fields
    const otherFields: string[] = [];
    for (const [key, value] of Object.entries(filtered)) {
      if (!usedKeys.has(key)) {
        otherFields.push(`${chalk.gray(key + ':')} ${formatValue(value)}`);
      }
    }

    if (otherFields.length > 0) {
      lines.push(`  ${chalk.bold('Details')}`);
      for (const f of otherFields) {
        lines.push(`    ${f}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 120) {
      return chalk.white(value.slice(0, 117) + '...');
    }
    return chalk.white(value);
  }
  if (typeof value === 'number') {
    return chalk.cyan(String(value));
  }
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    if (str.length > 120) {
      return chalk.gray(str.slice(0, 117) + '...');
    }
    return chalk.gray(str);
  }
  return chalk.white(String(value));
}

export async function testCommand(
  file: string,
  options: TestOptions
): Promise<void> {
  const config = await requireConfig();
  const apiKey = getApiKey();

  const client = new NanosiemClient({
    apiUrl: config.apiUrl,
    searchUrl: config.searchUrl,
    apiKey,
  });

  // Parse time options
  let days = 7;
  if (options.hours) {
    days = Math.ceil(parseInt(options.hours, 10) / 24);
  } else if (options.days) {
    days = parseInt(options.days, 10);
  }

  // Parse limit option
  let limit = 3;
  if (options.all) {
    limit = 1000; // Show up to 1000 events
  } else if (options.limit) {
    limit = parseInt(options.limit, 10);
  }

  // Parse custom fields
  const customFields = options.fields?.split(',').map(f => f.trim());

  console.log(chalk.bold(`\nTesting detection: ${chalk.cyan(file)}\n`));

  // Load and parse detection
  const content = await readFile(file, 'utf-8');
  const parseResult = parseDetectionFile(content, file);

  if (!parseResult.success) {
    console.log(chalk.red('Parse errors:'));
    for (const error of parseResult.errors) {
      console.log(chalk.red(`  ${error.message}`));
    }
    process.exit(1);
  }

  const detection = parseResult.detection!;

  // Validate
  const validation = validateDetection(detection);
  if (!validation.valid) {
    console.log(chalk.red('Validation errors:'));
    for (const error of validation.errors) {
      console.log(chalk.red(`  ${error.field}: ${error.message}`));
    }
    process.exit(1);
  }

  // Show full query
  console.log(chalk.bold('Query:'));
  console.log(chalk.gray('┌' + '─'.repeat(60)));
  for (const line of detection.query.trim().split('\n')) {
    console.log(chalk.gray('│ ') + chalk.cyan(line));
  }
  console.log(chalk.gray('└' + '─'.repeat(60)));
  console.log('');

  // Show test parameters
  const timeDesc = options.hours ? `${options.hours} hours` : `${days} days`;
  console.log(`Testing against ${chalk.yellow(timeDesc)} of historical data...`);
  console.log('');

  // Test query
  const result = await client.testQuery(detection.query, days);

  if (!result.success) {
    console.log(chalk.red(`Test failed: ${result.error?.message}`));
    process.exit(1);
  }

  const data = result.data!;

  // Calculate daily stats
  const daysAnalyzed = data.matches_by_day?.length || days;
  const dailyAverage = daysAnalyzed > 0 ? data.total_matches / daysAnalyzed : 0;

  // Display results summary
  console.log(chalk.bold('═══ Results ═══'));
  console.log(`  Total matches:   ${chalk.cyan.bold(data.total_matches.toLocaleString())}`);
  console.log(`  Days analyzed:   ${chalk.white(String(daysAnalyzed))}`);
  console.log(`  Daily average:   ${chalk.cyan(dailyAverage.toFixed(1))}`);
  if (data.execution_time_ms) {
    console.log(`  Execution time:  ${chalk.gray(data.execution_time_ms + 'ms')}`);
  }
  console.log('');

  // Alert fatigue assessment with visual indicator
  const fatigueBar = (level: string, color: (s: string) => string) => {
    const bars = level === 'HIGH' ? '████████' : level === 'MEDIUM' ? '█████░░░' : '██░░░░░░';
    return color(bars) + ' ' + color(level);
  };

  if (dailyAverage > 100) {
    console.log(`  Alert fatigue:   ${fatigueBar('HIGH', chalk.red)}`);
    console.log(chalk.red('  ⚠ This detection may generate too many alerts'));
    console.log(chalk.yellow('  → Consider adding filters or increasing thresholds'));
  } else if (dailyAverage > 50) {
    console.log(`  Alert fatigue:   ${fatigueBar('MEDIUM', chalk.yellow)}`);
    console.log(chalk.yellow('  ⚠ Consider reviewing alert volume'));
  } else if (dailyAverage > 0) {
    console.log(`  Alert fatigue:   ${fatigueBar('LOW', chalk.green)}`);
    console.log(chalk.green('  ✓ Alert volume looks manageable'));
  } else {
    console.log(`  Alert fatigue:   ${chalk.gray('░░░░░░░░')} ${chalk.gray('NONE')}`);
    console.log(chalk.yellow('  ⚠ No matches found - detection may need adjustment'));
  }
  console.log('');

  // Daily breakdown if available
  if (data.matches_by_day && data.matches_by_day.length > 0) {
    console.log(chalk.bold('═══ Daily Breakdown ═══'));
    const maxCount = Math.max(...data.matches_by_day.map(d => d.count));
    for (const day of data.matches_by_day.slice(-7)) { // Show last 7 days
      const barLength = maxCount > 0 ? Math.round((day.count / maxCount) * 20) : 0;
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      const dateStr = day.date.split('T')[0];
      console.log(`  ${chalk.gray(dateStr)} ${chalk.cyan(bar)} ${day.count}`);
    }
    console.log('');
  }

  // Sample events
  if (data.sample_events && data.sample_events.length > 0) {
    const eventsToShow = data.sample_events.slice(0, limit);
    const remaining = data.sample_events.length - eventsToShow.length;

    console.log(chalk.bold(`═══ Sample Events (${eventsToShow.length}${remaining > 0 ? ` of ${data.sample_events.length}` : ''}) ═══`));

    const useCompact = options.compact !== false && limit > 5;

    for (let i = 0; i < eventsToShow.length; i++) {
      console.log(formatEvent(eventsToShow[i] as Record<string, unknown>, i, useCompact, customFields));
    }

    if (remaining > 0) {
      console.log(chalk.gray(`\n  ... and ${remaining} more events (use --limit ${data.sample_events.length} or --all to see all)`));
    }
    console.log('');
  }
}
