/**
 * Detection validation logic
 *
 * Validates detection metadata and query against schema requirements
 */

import type { Detection, DetectionFrontmatter } from '../schema/types.js';

/** Validation error */
export interface ValidationError {
  /** Field that failed validation */
  field: string;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
}

/** Validation warning (non-fatal issue) */
export interface ValidationWarning {
  /** Field with warning */
  field: string;
  /** Warning message */
  message: string;
  /** Warning code */
  code: string;
}

/** Result of validating a detection */
export interface ValidationResult {
  /** Whether the detection is valid (no errors) */
  valid: boolean;
  /** Validation errors (fatal issues) */
  errors: ValidationError[];
  /** Validation warnings (non-fatal issues) */
  warnings: ValidationWarning[];
}

// Valid values for enums
const VALID_SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
] as const;
const VALID_MODES = ['staging', 'live', 'alerting'] as const;
const VALID_DETECTION_MODES = ['real-time', 'scheduled'] as const;
const VALID_CASE_VISIBILITIES = ['public', 'group', 'private'] as const;
const VALID_ALERT_MODES = ['grouped', 'per_event'] as const;
const VALID_AUTO_TUNING_MODES = ['off', 'proposals', 'auto_approve'] as const;

// Regex patterns for validation
// Cron field pattern: *, number, */n, range (n-m), list (n,m), or combinations
const CRON_FIELD = '(\\*|\\*\\/\\d+|\\d+|\\d+-\\d+|[\\d,\\-\\/\\*]+)';
const CRON_5_FIELD = new RegExp(
  `^${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}$`
);
const CRON_6_FIELD = new RegExp(
  `^${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}$`
);
const LOOKBACK_REGEX = /^(\d+)(s|m|h|d)$/;
const MITRE_TACTIC_REGEX = /^TA\d{4}$/;
const MITRE_TECHNIQUE_REGEX = /^T\d{4}(\.\d{3})?$/;

/**
 * Validate a parsed detection
 *
 * @param detection - Parsed detection to validate
 * @returns Validation result with errors and warnings
 */
export function validateDetection(detection: Detection): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const { metadata, query } = detection;

  // Required fields
  validateRequired(metadata, errors);

  // Enum values
  validateEnums(metadata, errors, warnings);

  // Schedule validation
  validateSchedule(metadata, errors, warnings);

  // Lookback validation
  validateLookback(metadata, errors);

  // MITRE ATT&CK validation
  validateMitre(metadata, warnings);

  // AI triage hints validation
  validateAiTriageHints(metadata, warnings);

  // Case visibility validation
  validateCaseVisibility(metadata, errors);

  // Auto-tuning validation
  validateAutoTuning(metadata, errors);

  // Requires validation
  validateRequires(metadata, warnings);

  // Query validation (basic)
  validateQuery(query, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateRequired(
  metadata: DetectionFrontmatter,
  errors: ValidationError[]
): void {
  if (!metadata.title || metadata.title.trim() === '') {
    errors.push({
      field: 'title',
      message: 'Title is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!metadata.severity) {
    errors.push({
      field: 'severity',
      message: 'Severity is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!metadata.mode) {
    errors.push({
      field: 'mode',
      message: 'Mode is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!metadata.detection_mode) {
    errors.push({
      field: 'detection_mode',
      message: 'Detection mode is required',
      code: 'REQUIRED_FIELD',
    });
  }
}

function validateEnums(
  metadata: DetectionFrontmatter,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  if (
    metadata.severity &&
    !VALID_SEVERITIES.includes(metadata.severity as (typeof VALID_SEVERITIES)[number])
  ) {
    errors.push({
      field: 'severity',
      message: `Invalid severity: "${metadata.severity}". Must be one of: ${VALID_SEVERITIES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  if (
    metadata.mode &&
    !VALID_MODES.includes(metadata.mode as (typeof VALID_MODES)[number])
  ) {
    errors.push({
      field: 'mode',
      message: `Invalid mode: "${metadata.mode}". Must be one of: ${VALID_MODES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  if (
    metadata.detection_mode &&
    !VALID_DETECTION_MODES.includes(
      metadata.detection_mode as (typeof VALID_DETECTION_MODES)[number]
    )
  ) {
    errors.push({
      field: 'detection_mode',
      message: `Invalid detection_mode: "${metadata.detection_mode}". Must be one of: ${VALID_DETECTION_MODES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  if (
    metadata.alert_mode &&
    !VALID_ALERT_MODES.includes(
      metadata.alert_mode as (typeof VALID_ALERT_MODES)[number]
    )
  ) {
    errors.push({
      field: 'alert_mode',
      message: `Invalid alert_mode: "${metadata.alert_mode}". Must be one of: ${VALID_ALERT_MODES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  if (
    metadata.alert_mode === 'per_event' &&
    metadata.detection_mode === 'real-time'
  ) {
    warnings.push({
      field: 'alert_mode',
      message:
        'per_event alert_mode with real-time detection_mode is redundant — real-time rules already process events individually',
      code: 'REDUNDANT_CONFIG',
    });
  }
}

function validateSchedule(
  metadata: DetectionFrontmatter,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  if (metadata.detection_mode === 'scheduled') {
    if (!metadata.schedule) {
      warnings.push({
        field: 'schedule',
        message:
          'No schedule specified for scheduled detection. Will use default (every minute)',
        code: 'MISSING_OPTIONAL',
      });
    } else {
      // Validate cron expression (5 or 6 field)
      const isCron5 = CRON_5_FIELD.test(metadata.schedule);
      const isCron6 = CRON_6_FIELD.test(metadata.schedule);

      if (!isCron5 && !isCron6) {
        errors.push({
          field: 'schedule',
          message: `Invalid cron expression: "${metadata.schedule}". Expected 5 or 6 field cron format`,
          code: 'INVALID_CRON',
        });
      }
    }
  }
}

function validateLookback(
  metadata: DetectionFrontmatter,
  errors: ValidationError[]
): void {
  if (metadata.lookback && !LOOKBACK_REGEX.test(metadata.lookback)) {
    errors.push({
      field: 'lookback',
      message: `Invalid lookback format: "${metadata.lookback}". Expected format like "15m", "1h", "24h", "7d"`,
      code: 'INVALID_FORMAT',
    });
  }
}

function validateMitre(
  metadata: DetectionFrontmatter,
  warnings: ValidationWarning[]
): void {
  const tactics = Array.isArray(metadata.mitre_tactics)
    ? metadata.mitre_tactics
    : metadata.mitre_tactics
      ? [metadata.mitre_tactics]
      : [];

  const techniques = Array.isArray(metadata.mitre_techniques)
    ? metadata.mitre_techniques
    : metadata.mitre_techniques
      ? [metadata.mitre_techniques]
      : [];

  // Check for missing MITRE mappings
  if (tactics.length === 0 && techniques.length === 0) {
    warnings.push({
      field: 'mitre',
      message: 'No MITRE ATT&CK mappings specified',
      code: 'MISSING_MITRE',
    });
  }

  // Validate tactic format
  for (const tactic of tactics) {
    if (!MITRE_TACTIC_REGEX.test(tactic)) {
      warnings.push({
        field: 'mitre_tactics',
        message: `Non-standard tactic format: "${tactic}" (expected TAxxxx)`,
        code: 'INVALID_MITRE_FORMAT',
      });
    }
  }

  // Validate technique format
  for (const technique of techniques) {
    if (!MITRE_TECHNIQUE_REGEX.test(technique)) {
      warnings.push({
        field: 'mitre_techniques',
        message: `Non-standard technique format: "${technique}" (expected Txxxx or Txxxx.xxx)`,
        code: 'INVALID_MITRE_FORMAT',
      });
    }
  }
}

function validateAiTriageHints(
  metadata: DetectionFrontmatter,
  warnings: ValidationWarning[]
): void {
  const hints = metadata.ai_triage_hints;
  if (!hints) return;

  // Check for empty arrays
  if (hints.ignore_when && hints.ignore_when.length === 0) {
    warnings.push({
      field: 'ai_triage_hints.ignore_when',
      message: 'ignore_when array is empty. Consider adding benign conditions or removing the field',
      code: 'EMPTY_ARRAY',
    });
  }

  if (hints.suspicious_when && hints.suspicious_when.length === 0) {
    warnings.push({
      field: 'ai_triage_hints.suspicious_when',
      message: 'suspicious_when array is empty. Consider adding suspicious conditions or removing the field',
      code: 'EMPTY_ARRAY',
    });
  }

  // Check for very long hints (may be too verbose)
  const allHints = [...(hints.ignore_when || []), ...(hints.suspicious_when || [])];
  for (const hint of allHints) {
    if (hint.length > 200) {
      warnings.push({
        field: 'ai_triage_hints',
        message: `Hint is very long (${hint.length} chars). Consider being more concise`,
        code: 'HINT_TOO_LONG',
      });
      break; // Only warn once
    }
  }
}

function validateCaseVisibility(
  metadata: DetectionFrontmatter,
  errors: ValidationError[]
): void {
  if (metadata.case_visibility) {
    if (
      !VALID_CASE_VISIBILITIES.includes(
        metadata.case_visibility as (typeof VALID_CASE_VISIBILITIES)[number]
      )
    ) {
      errors.push({
        field: 'case_visibility',
        message: `Invalid case_visibility: "${metadata.case_visibility}". Must be one of: ${VALID_CASE_VISIBILITIES.join(', ')}`,
        code: 'INVALID_ENUM',
      });
    }

    // case_groups is required when visibility is 'group'
    if (metadata.case_visibility === 'group') {
      if (!metadata.case_groups || metadata.case_groups.length === 0) {
        errors.push({
          field: 'case_groups',
          message: 'case_groups is required when case_visibility is "group"',
          code: 'REQUIRED_FIELD',
        });
      }
    }
  }

  // Validate case_groups format (alphanumeric and hyphens only)
  if (metadata.case_groups) {
    const SLUG_REGEX = /^[a-z0-9-]+$/;
    for (const group of metadata.case_groups) {
      if (!SLUG_REGEX.test(group)) {
        errors.push({
          field: 'case_groups',
          message: `Invalid group slug: "${group}". Must be lowercase alphanumeric with hyphens`,
          code: 'INVALID_FORMAT',
        });
      }
    }
  }
}

function validateAutoTuning(
  metadata: DetectionFrontmatter,
  errors: ValidationError[]
): void {
  const autoTuning = metadata.auto_tuning;
  if (!autoTuning) return;

  // Validate mode enum
  if (
    autoTuning.mode &&
    !VALID_AUTO_TUNING_MODES.includes(
      autoTuning.mode as (typeof VALID_AUTO_TUNING_MODES)[number]
    )
  ) {
    errors.push({
      field: 'auto_tuning.mode',
      message: `Invalid auto_tuning mode: "${autoTuning.mode}". Must be one of: ${VALID_AUTO_TUNING_MODES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  // Validate min_confidence range
  if (autoTuning.min_confidence !== undefined) {
    if (
      typeof autoTuning.min_confidence !== 'number' ||
      autoTuning.min_confidence < 0 ||
      autoTuning.min_confidence > 1
    ) {
      errors.push({
        field: 'auto_tuning.min_confidence',
        message: `min_confidence must be a number between 0.0 and 1.0. Got: ${autoTuning.min_confidence}`,
        code: 'OUT_OF_RANGE',
      });
    }
  }

  // Validate boolean fields
  if (autoTuning.enabled !== undefined && typeof autoTuning.enabled !== 'boolean') {
    errors.push({
      field: 'auto_tuning.enabled',
      message: 'auto_tuning.enabled must be a boolean',
      code: 'INVALID_TYPE',
    });
  }

  if (autoTuning.critical !== undefined && typeof autoTuning.critical !== 'boolean') {
    errors.push({
      field: 'auto_tuning.critical',
      message: 'auto_tuning.critical must be a boolean',
      code: 'INVALID_TYPE',
    });
  }
}

function validateRequires(
  metadata: DetectionFrontmatter,
  warnings: ValidationWarning[]
): void {
  const requires = metadata.requires;
  if (!requires) return;

  // Check that fields array exists and is not empty
  if (!requires.fields || requires.fields.length === 0) {
    warnings.push({
      field: 'requires.fields',
      message: 'requires.fields is empty. Consider specifying required UDM fields',
      code: 'EMPTY_ARRAY',
    });
  }

  // Validate field names are valid UDM fields (basic check - lowercase with underscores)
  const FIELD_REGEX = /^[a-z][a-z0-9_]*$/;
  if (requires.fields) {
    for (const field of requires.fields) {
      if (!FIELD_REGEX.test(field)) {
        warnings.push({
          field: 'requires.fields',
          message: `Potentially invalid UDM field name: "${field}". Expected lowercase with underscores`,
          code: 'INVALID_FORMAT',
        });
      }
    }
  }

  // Validate source_types if provided
  if (requires.source_types) {
    for (const sourceType of requires.source_types) {
      if (!FIELD_REGEX.test(sourceType.toLowerCase())) {
        warnings.push({
          field: 'requires.source_types',
          message: `Potentially invalid source_type: "${sourceType}"`,
          code: 'INVALID_FORMAT',
        });
      }
    }
  }
}

function validateQuery(
  query: string,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  if (!query || query.trim() === '') {
    errors.push({
      field: 'query',
      message: 'Query body is required',
      code: 'REQUIRED_FIELD',
    });
    return;
  }

  // Basic query validation - check for common issues
  const trimmed = query.trim();

  // Warn if query doesn't start with a source filter
  if (!trimmed.startsWith('source_type=') && !trimmed.startsWith('*')) {
    warnings.push({
      field: 'query',
      message: 'Query should typically start with source_type= filter or *',
      code: 'QUERY_NO_SOURCE',
    });
  }

  // Check for unclosed quotes
  const singleQuotes = (trimmed.match(/'/g) || []).length;
  const doubleQuotes = (trimmed.match(/"/g) || []).length;

  if (singleQuotes % 2 !== 0) {
    errors.push({
      field: 'query',
      message: 'Unclosed single quote in query',
      code: 'UNCLOSED_QUOTE',
    });
  }

  if (doubleQuotes % 2 !== 0) {
    errors.push({
      field: 'query',
      message: 'Unclosed double quote in query',
      code: 'UNCLOSED_QUOTE',
    });
  }
}

/**
 * Parse and convert lookback string to minutes
 *
 * @param lookback - Lookback string (e.g., "15m", "1h", "7d")
 * @returns Number of minutes, or undefined if invalid
 */
export function parseLookbackToMinutes(lookback: string): number | undefined {
  const match = lookback.match(LOOKBACK_REGEX);
  if (!match) return undefined;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return Math.ceil(value / 60);
    case 'm':
      return value;
    case 'h':
      return value * 60;
    case 'd':
      return value * 60 * 24;
    default:
      return undefined;
  }
}
