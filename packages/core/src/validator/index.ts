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
  validateEnums(metadata, errors);

  // Schedule validation
  validateSchedule(metadata, errors, warnings);

  // Lookback validation
  validateLookback(metadata, errors);

  // MITRE ATT&CK validation
  validateMitre(metadata, warnings);

  // Risk score validation
  validateRiskScore(metadata, errors);

  // Risk modifiers validation
  validateRiskModifiers(metadata, errors);

  // AI triage hints validation
  validateAiTriageHints(metadata, warnings);

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
  errors: ValidationError[]
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

function validateRiskScore(
  metadata: DetectionFrontmatter,
  errors: ValidationError[]
): void {
  if (metadata.risk_score !== undefined && metadata.risk_score !== 'auto') {
    if (typeof metadata.risk_score !== 'number') {
      errors.push({
        field: 'risk_score',
        message: `Invalid risk_score type. Expected number (0-100) or "auto"`,
        code: 'INVALID_TYPE',
      });
    } else if (metadata.risk_score < 0 || metadata.risk_score > 100) {
      errors.push({
        field: 'risk_score',
        message: `Risk score must be between 0 and 100. Got: ${metadata.risk_score}`,
        code: 'OUT_OF_RANGE',
      });
    }
  }
}

function validateRiskModifiers(
  metadata: DetectionFrontmatter,
  errors: ValidationError[]
): void {
  if (!metadata.risk_modifiers) return;

  const validOperators = ['>', '<', '>=', '<=', '=', '!=', 'contains'];

  for (let i = 0; i < metadata.risk_modifiers.length; i++) {
    const modifier = metadata.risk_modifiers[i];

    if (!modifier.condition || modifier.condition.trim() === '') {
      errors.push({
        field: `risk_modifiers[${i}].condition`,
        message: 'Risk modifier condition is required',
        code: 'REQUIRED_FIELD',
      });
    } else {
      // Check for operator
      const hasOperator = validOperators.some((op) =>
        modifier.condition.includes(op)
      );
      if (!hasOperator) {
        errors.push({
          field: `risk_modifiers[${i}].condition`,
          message: `Risk modifier condition must contain an operator (${validOperators.join(', ')})`,
          code: 'INVALID_CONDITION',
        });
      }
    }

    if (typeof modifier.score !== 'number') {
      errors.push({
        field: `risk_modifiers[${i}].score`,
        message: 'Risk modifier score must be a number',
        code: 'INVALID_TYPE',
      });
    } else if (modifier.score < 0 || modifier.score > 100) {
      errors.push({
        field: `risk_modifiers[${i}].score`,
        message: `Risk modifier score must be between 0 and 100. Got: ${modifier.score}`,
        code: 'OUT_OF_RANGE',
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
