/**
 * nanodac - Detection-as-Code CLI for NanoSIEM
 */

import { Command } from 'commander';
import {
  initCommand,
  validateCommand,
  syncCommand,
  testCommand,
  diffCommand,
  pullCommand,
  issueCreateCommand,
  issueListCommand,
} from './commands/index.js';

const program = new Command();

program
  .name('nanodac')
  .description('Detection-as-Code CLI for NanoSIEM')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new nanodac project')
  .option('-d, --directory <dir>', 'Target directory', '.')
  .action(initCommand);

program
  .command('validate')
  .description('Validate detection files')
  .argument('[files...]', 'Files to validate (default: all in detections/)')
  .option('--strict', 'Treat warnings as errors')
  .action(validateCommand);

program
  .command('test')
  .description('Test a detection against historical data')
  .argument('<file>', 'Detection file to test')
  .option('-d, --days <days>', 'Days of historical data', '7')
  .option('-H, --hours <hours>', 'Hours of historical data (overrides --days)')
  .option('-l, --limit <count>', 'Max events to show', '3')
  .option('-a, --all', 'Show all sample events (up to 1000)')
  .option('-f, --fields <fields>', 'Comma-separated fields to show')
  .option('-c, --compact', 'Compact event display')
  .action(testCommand);

program
  .command('sync')
  .description('Sync local detections to NanoSIEM')
  .option('--dry-run', 'Show changes without applying')
  .option('--force', 'Skip confirmation prompts')
  .option('--env <environment>', 'Environment to use')
  .action(syncCommand);

program
  .command('diff')
  .description('Show differences between local and remote detections')
  .option('-v, --verbose', 'Show detailed changes')
  .action(diffCommand);

program
  .command('pull')
  .description('Sync repo by pulling latest detections from main')
  .option('-b, --branch <branch>', 'Base branch to pull from', 'main')
  .option('--no-stash', 'Fail instead of stashing uncommitted changes')
  .action(pullCommand);

// GitHub issue subcommands
const issueCmd = program
  .command('issue')
  .description('Manage GitHub issues for detection tracking');

issueCmd
  .command('create')
  .description('Create a new GitHub issue')
  .requiredOption('-t, --title <title>', 'Issue title')
  .option('-b, --body <body>', 'Issue description')
  .option('-l, --labels <labels>', 'Comma-separated labels (e.g., "detection,tuning")')
  .option('-a, --assignee <user>', 'Assign to user')
  .action(issueCreateCommand);

issueCmd
  .command('list')
  .description('List GitHub issues')
  .option('-s, --state <state>', 'Filter by state (open, closed, all)', 'open')
  .option('-l, --labels <labels>', 'Filter by labels')
  .option('-a, --assignee <user>', 'Filter by assignee')
  .option('--limit <count>', 'Maximum issues to show', '20')
  .action(issueListCommand);

program.parse();
