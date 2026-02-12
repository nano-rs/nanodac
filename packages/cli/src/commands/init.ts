/**
 * nanodac init command
 *
 * Initializes a new nanodac project with config file and detections directory
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DEFAULT_CONFIG } from '../config.js';

interface InitOptions {
  directory?: string;
}

const EXAMPLE_DETECTION = `---
title: example_detection
description: Example detection rule - customize or delete this file
author: your-name
severity: medium
mode: staging
detection_mode: scheduled
schedule: "*/5 * * * *"
lookback: 15m
alert_mode: grouped
mitre_tactics: TA0001
mitre_techniques: T1078
risk_score: auto
risk_entity: auto-detect
tags:
  - example
ai_triage_hints:
  ignore_when:
    - "User is service account"
  suspicious_when:
    - "Login from unusual location"
  context: "This is an example detection. Customize the hints based on your environment."
---
source_type=auth_logs
  | where action="login"
  | stats count() by user_name, src_ip
  | where count > 10
`;

export async function initCommand(options: InitOptions): Promise<void> {
  const targetDir = options.directory || '.';
  const configPath = join(targetDir, 'nanodac.config.yaml');
  const detectionsDir = join(targetDir, 'detections');
  const examplePath = join(detectionsDir, 'example_detection.yaml');

  console.log(chalk.bold('\nInitializing nanodac project...\n'));

  // Check if config already exists
  if (existsSync(configPath)) {
    console.log(
      chalk.yellow(`  Config file already exists: ${configPath}`)
    );
  } else {
    await writeFile(configPath, DEFAULT_CONFIG, 'utf-8');
    console.log(chalk.green(`  Created config file: ${configPath}`));
  }

  // Create detections directory
  if (existsSync(detectionsDir)) {
    console.log(
      chalk.yellow(`  Detections directory already exists: ${detectionsDir}`)
    );
  } else {
    await mkdir(detectionsDir, { recursive: true });
    console.log(chalk.green(`  Created detections directory: ${detectionsDir}`));

    // Create example detection
    await writeFile(examplePath, EXAMPLE_DETECTION, 'utf-8');
    console.log(chalk.green(`  Created example detection: ${examplePath}`));
  }

  console.log(chalk.bold('\nNext steps:\n'));
  console.log('  1. Edit nanodac.config.yaml with your NanoSIEM URL');
  console.log('  2. Set your API key: export NANOSIEM_API_KEY=your-key');
  console.log('  3. Create detection files in the detections/ directory');
  console.log('  4. Run: nanodac validate');
  console.log('  5. Run: nanodac sync --dry-run');
  console.log('');
}
