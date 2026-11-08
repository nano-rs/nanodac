/**
 * nanodac validate command
 *
 * Validates detection files against the schema
 */

import { readFile } from 'fs/promises';
import fg from 'fast-glob';
import chalk from 'chalk';
import { parseDetectionFile, validateDetection } from '@nano-rs/dac-core';
import { loadConfig } from '../config.js';

interface ValidateOptions {
  strict?: boolean;
}

export async function validateCommand(
  files: string[],
  options: ValidateOptions
): Promise<void> {
  // Load config to get detections directory
  const config = await loadConfig();
  const detectionsDir = config?.detectionsDir || './detections';

  // Determine files to validate
  let filePaths: string[];
  if (files.length > 0) {
    filePaths = files;
  } else {
    // Find all detection files
    const patterns = [`${detectionsDir}/**/*.yaml`, `${detectionsDir}/**/*.yml`];
    filePaths = await fg.glob(patterns);
  }

  if (filePaths.length === 0) {
    console.log(chalk.yellow('No detection files found'));
    return;
  }

  console.log(chalk.bold(`\nValidating ${filePaths.length} detection file(s)...\n`));

  let totalErrors = 0;
  let totalWarnings = 0;
  let validCount = 0;

  for (const filePath of filePaths) {
    const content = await readFile(filePath, 'utf-8');
    const parseResult = parseDetectionFile(content, filePath);

    if (!parseResult.success) {
      totalErrors += parseResult.errors.length;
      console.log(chalk.red(`${filePath}:`));
      for (const error of parseResult.errors) {
        const location = error.line ? `:${error.line}` : '';
        console.log(chalk.red(`  ERROR: ${error.message}${location}`));
      }
      console.log('');
      continue;
    }

    const validation = validateDetection(parseResult.detection!);

    if (validation.errors.length > 0 || validation.warnings.length > 0) {
      console.log(chalk.white(`${filePath}:`));

      for (const error of validation.errors) {
        totalErrors++;
        console.log(
          chalk.red(`  ERROR [${error.code}] ${error.field}: ${error.message}`)
        );
      }

      for (const warning of validation.warnings) {
        totalWarnings++;
        console.log(
          chalk.yellow(`  WARN [${warning.code}] ${warning.field}: ${warning.message}`)
        );
      }

      console.log('');
    }

    if (validation.valid) {
      validCount++;
    }
  }

  // Summary
  console.log(chalk.bold('Summary:'));
  console.log(`  Total files: ${filePaths.length}`);
  console.log(chalk.green(`  Valid: ${validCount}`));

  if (totalErrors > 0) {
    console.log(chalk.red(`  Errors: ${totalErrors}`));
  }

  if (totalWarnings > 0) {
    console.log(chalk.yellow(`  Warnings: ${totalWarnings}`));
  }

  console.log('');

  // Exit code
  if (totalErrors > 0) {
    console.log(chalk.red('Validation failed'));
    process.exit(1);
  } else if (totalWarnings > 0 && options.strict) {
    console.log(
      chalk.yellow('Validation passed with warnings (--strict mode: treating as failure)')
    );
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log(chalk.yellow('Validation passed with warnings'));
  } else {
    console.log(chalk.green('All detections valid'));
  }
}
