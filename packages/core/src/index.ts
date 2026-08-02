/**
 * @nano-rs/dac-core - Core library for NanoSIEM detection-as-code
 *
 * This package provides:
 * - Type definitions for detection files and API payloads
 * - YAML frontmatter parser for detection files
 * - Validation logic for detection schemas
 * - API client for NanoSIEM
 */

// Schema types
export * from './schema/index.js';

// Parser
export * from './parser/index.js';

// Validator
export * from './validator/index.js';

// API client
export * from './client/index.js';

// Grouping logic (alert_mode=grouped bucketing)
export * from './grouping/index.js';
