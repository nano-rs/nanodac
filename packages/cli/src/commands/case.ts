/**
 * GitHub issue management commands
 */

import { execSync, spawn } from 'child_process';
import chalk from 'chalk';

interface IssueCreateOptions {
  title: string;
  body?: string;
  labels?: string;
  assignee?: string;
}

/**
 * Create a GitHub issue using gh CLI
 */
export async function issueCreateCommand(options: IssueCreateOptions): Promise<void> {
  try {
    // Check if gh is installed
    try {
      execSync('gh --version', { stdio: 'ignore' });
    } catch {
      console.error(chalk.red('GitHub CLI (gh) is not installed.'));
      console.error('Install it from: https://cli.github.com/');
      process.exit(1);
    }

    // Build gh issue create command
    const args = ['issue', 'create', '--title', options.title];

    if (options.body) {
      args.push('--body', options.body);
    }

    if (options.labels) {
      args.push('--label', options.labels);
    }

    if (options.assignee) {
      args.push('--assignee', options.assignee);
    }

    console.log(chalk.cyan('Creating GitHub issue...'));
    console.log(`  Title: ${options.title}`);
    if (options.body) {
      console.log(`  Body: ${options.body.substring(0, 100)}${options.body.length > 100 ? '...' : ''}`);
    }
    if (options.labels) {
      console.log(`  Labels: ${options.labels}`);
    }
    console.log();

    // Execute gh issue create
    const result = execSync(`gh ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`, {
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    console.log(chalk.green('Issue created successfully!'));
    console.log(result.trim());
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      console.error(chalk.red(`Failed to create issue: ${(error as any).stderr}`));
    } else {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
    process.exit(1);
  }
}

interface IssueListOptions {
  state?: string;
  labels?: string;
  assignee?: string;
  limit?: string;
}

/**
 * List GitHub issues using gh CLI
 */
export async function issueListCommand(options: IssueListOptions): Promise<void> {
  try {
    // Check if gh is installed
    try {
      execSync('gh --version', { stdio: 'ignore' });
    } catch {
      console.error(chalk.red('GitHub CLI (gh) is not installed.'));
      console.error('Install it from: https://cli.github.com/');
      process.exit(1);
    }

    // Build gh issue list command
    const args = ['issue', 'list', '--json', 'number,title,state,labels,assignees,createdAt'];

    if (options.state) {
      args.push('--state', options.state);
    }

    if (options.labels) {
      args.push('--label', options.labels);
    }

    if (options.assignee) {
      args.push('--assignee', options.assignee);
    }

    const limit = options.limit ? parseInt(options.limit, 10) : 20;
    args.push('--limit', String(limit));

    const result = execSync(`gh ${args.join(' ')}`, {
      encoding: 'utf-8',
    });

    const issues = JSON.parse(result) as Array<{
      number: number;
      title: string;
      state: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>;
      createdAt: string;
    }>;

    if (issues.length === 0) {
      console.log(chalk.yellow('No issues found.'));
      return;
    }

    console.log(chalk.bold(`Found ${issues.length} issues:\n`));

    for (const issue of issues) {
      const stateColor = issue.state === 'OPEN' ? chalk.green : chalk.gray;

      console.log(`  ${chalk.bold(`#${issue.number}`)} ${issue.title}`);
      console.log(
        `     ${stateColor(issue.state)} | ${new Date(issue.createdAt).toLocaleDateString()}`
      );
      if (issue.labels.length > 0) {
        console.log(`     Labels: ${issue.labels.map(l => l.name).join(', ')}`);
      }
      if (issue.assignees.length > 0) {
        console.log(`     Assignees: ${issue.assignees.map(a => a.login).join(', ')}`);
      }
      console.log();
    }
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      console.error(chalk.red(`Failed to list issues: ${(error as any).stderr}`));
    } else {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
    process.exit(1);
  }
}
