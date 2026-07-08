/**
 * Configuration loader for nanodac
 */

import { readFile } from 'fs/promises';
import { NanosiemClient } from '@nanodac/core';
import { existsSync, readFileSync as readFileSyncFs } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join, dirname } from 'path';

/**
 * Load environment variables from .env file
 */
function loadEnvFile(startDir: string): void {
  const envFiles = ['.env', '.env.local'];
  let currentDir = startDir;

  while (currentDir !== '/') {
    for (const envFile of envFiles) {
      const envPath = join(currentDir, envFile);
      if (existsSync(envPath)) {
        try {
          const content = readFileSyncFs(envPath, 'utf-8');
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) continue;

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
              const key = trimmed.slice(0, eqIndex).trim();
              let value = trimmed.slice(eqIndex + 1).trim();

              // Remove quotes if present
              if ((value.startsWith('"') && value.endsWith('"')) ||
                  (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
              }

              // Only set if not already in environment
              if (!process.env[key]) {
                process.env[key] = value;
              }
            }
          }
        } catch {
          // Ignore errors reading .env file
        }
        return; // Stop after finding first .env file
      }
    }
    currentDir = dirname(currentDir);
  }
}

// Load .env file on module import
loadEnvFile(process.cwd());

/** nanodac configuration */
export interface NanodacConfig {
  /** NanoSIEM API URL */
  apiUrl: string;
  /** Search service URL (optional) */
  searchUrl?: string;
  /** Path to detections directory */
  detectionsDir: string;
  /**
   * DaC repo URL (e.g. https://github.com/acme/detections). Optional and
   * informational — sent as `source_repo_url` provenance (NAN-1764) when set.
   */
  repoUrl?: string;
  /**
   * Absolute directory containing the config file — the repo-root anchor used
   * to make file paths repo-root-relative for `source_path` provenance
   * (NAN-1764). Set by `loadConfig`; not a user-authored field.
   */
  baseDir?: string;
  /** Default severity for new detections */
  defaultSeverity?: 'medium' | 'low' | 'high' | 'critical' | 'informational';
  /** Default mode for new detections */
  defaultMode?: 'staging' | 'live' | 'alerting';
  /** Default detection mode */
  defaultDetectionMode?: 'scheduled' | 'real-time';
  /** Sync behavior */
  sync?: {
    /** Delete remote detections not in local files */
    deleteOrphans?: boolean;
    /** Require confirmation before destructive operations */
    confirmDestructive?: boolean;
  };
}

const CONFIG_FILENAMES = ['nanodac.config.yaml', 'nanodac.config.yml', 'nanodac.yaml'];

/**
 * Find the config file by walking up the directory tree
 */
async function findConfigFile(startDir: string): Promise<string | null> {
  let currentDir = startDir;

  while (currentDir !== '/') {
    for (const filename of CONFIG_FILENAMES) {
      const configPath = join(currentDir, filename);
      if (existsSync(configPath)) {
        return configPath;
      }
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Load nanodac configuration
 *
 * @param cwd - Current working directory (default: process.cwd())
 * @returns Loaded config or null if not found
 */
export async function loadConfig(cwd?: string): Promise<NanodacConfig | null> {
  const startDir = cwd || process.cwd();
  const configPath = await findConfigFile(startDir);

  if (!configPath) {
    return null;
  }

  const content = await readFile(configPath, 'utf-8');
  const config = parseYaml(content) as NanodacConfig;

  // The config file lives at the DaC repo root by convention; anchor
  // repo-relative provenance paths to it (NAN-1764).
  config.baseDir = dirname(configPath);

  // Resolve detectionsDir relative to config file
  if (config.detectionsDir && !config.detectionsDir.startsWith('/')) {
    config.detectionsDir = join(dirname(configPath), config.detectionsDir);
  }

  return config;
}

/**
 * Load config or throw if not found
 */
export async function requireConfig(cwd?: string): Promise<NanodacConfig> {
  const config = await loadConfig(cwd);
  if (!config) {
    throw new Error(
      'No nanodac.config.yaml found. Run `nanodac init` to create one.'
    );
  }
  return config;
}

/**
 * Get API key from environment (loaded from .env file or environment)
 */
export function getApiKey(): string {
  const key = process.env.NANOSIEM_API_KEY;
  if (!key) {
    throw new Error(
      'NANOSIEM_API_KEY is required.\n' +
        'Either:\n' +
        '  1. Create a .env file with: NANOSIEM_API_KEY=your-api-key\n' +
        '  2. Or export it: export NANOSIEM_API_KEY=your-api-key'
    );
  }
  return key;
}

/**
 * Default config template for init command
 */
export const DEFAULT_CONFIG = `# Nanodac Configuration
# Detection-as-Code for NanoSIEM

# NanoSIEM API URL
apiUrl: https://your-nanosiem-instance.com:3001

# Search service URL (optional, defaults to apiUrl on port 3002)
# searchUrl: https://your-nanosiem-instance.com:3002

# Path to detections directory (relative to this file)
detectionsDir: ./detections

# Default values for new detections
defaultSeverity: medium
defaultMode: staging
defaultDetectionMode: scheduled

# Sync behavior
sync:
  # Delete remote detections not present in local files
  deleteOrphans: false
  # Require confirmation before delete/update operations
  confirmDestructive: true
`;

/**
 * Create a NanosiemClient from config
 */
export function getClient(config: NanodacConfig): NanosiemClient {
  const apiKey = getApiKey();
  return new NanosiemClient({
    apiUrl: config.apiUrl,
    searchUrl: config.searchUrl,
    apiKey,
  });
}
