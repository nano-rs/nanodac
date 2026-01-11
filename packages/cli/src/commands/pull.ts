/**
 * Pull/sync command - ensures repo is up to date before starting work
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

interface PullOptions {
  branch?: string;
  stash?: boolean;
}

/**
 * Sync the repository by pulling latest from main
 */
export async function pullCommand(options: PullOptions): Promise<void> {
  const baseBranch = options.branch || 'main';

  try {
    console.log(chalk.cyan('Syncing repository...\n'));

    // Check for uncommitted changes
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    if (status) {
      if (options.stash !== false) {
        console.log(chalk.yellow('Stashing uncommitted changes...'));
        execSync('git stash push -m "nanodac: auto-stash before pull"', {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        console.log(chalk.gray('  Changes stashed. Use `git stash pop` to restore.\n'));
      } else {
        console.error(chalk.red('Uncommitted changes detected. Commit or stash them first.'));
        console.log('\nUncommitted files:');
        console.log(chalk.gray(status));
        process.exit(1);
      }
    }

    // Get current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
    }).trim();

    // Checkout base branch if not already on it
    if (currentBranch !== baseBranch) {
      console.log(chalk.gray(`Switching from ${currentBranch} to ${baseBranch}...`));
      execSync(`git checkout ${baseBranch}`, { encoding: 'utf-8', stdio: 'pipe' });
    }

    // Fetch and pull latest
    console.log(chalk.gray(`Fetching from origin...`));
    execSync('git fetch origin', { encoding: 'utf-8', stdio: 'pipe' });

    console.log(chalk.gray(`Pulling latest from origin/${baseBranch}...`));
    const pullResult = execSync(`git pull origin ${baseBranch}`, { encoding: 'utf-8' });

    // Show result
    if (pullResult.includes('Already up to date')) {
      console.log(chalk.green('\n✓ Already up to date'));
    } else {
      console.log(chalk.green('\n✓ Updated to latest'));
    }

    // Show latest commit
    const latestCommit = execSync('git log -1 --oneline', { encoding: 'utf-8' }).trim();
    console.log(chalk.gray(`  Latest: ${latestCommit}`));

    // Show detection count
    try {
      const detectionCount = execSync('find detections -name "*.yaml" -o -name "*.yml" 2>/dev/null | wc -l', {
        encoding: 'utf-8',
      }).trim();
      console.log(chalk.gray(`  Detections: ${detectionCount} files`));
    } catch {
      // detections folder may not exist
    }

    console.log(chalk.green('\nReady to create new detections!'));
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      console.error(chalk.red(`Failed to sync: ${(error as any).stderr}`));
    } else {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
    process.exit(1);
  }
}
