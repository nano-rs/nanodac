/**
 * YAML frontmatter parser for detection files
 *
 * Parses detection files in the format:
 * ---
 * title: detection_name
 * severity: medium
 * ...
 * ---
 * metadata.log_source="logs" | where status_id=2
 */

import { parse as parseYaml } from 'yaml';
import type { Detection, DetectionFrontmatter } from '../schema/types.js';

/** Parse error types */
export type ParseErrorType =
  | 'frontmatter_missing'
  | 'frontmatter_malformed'
  | 'yaml_invalid'
  | 'query_missing';

/** Parse error with location information */
export interface ParseError {
  /** Error type */
  type: ParseErrorType;
  /** Human-readable error message */
  message: string;
  /** Line number where error occurred (1-indexed) */
  line?: number;
  /** Column number where error occurred (1-indexed) */
  column?: number;
}

/** Result of parsing a detection file */
export interface ParseResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Parsed detection (if successful) */
  detection?: Detection;
  /** Parse errors (if any) */
  errors: ParseError[];
}

/** Regex to match YAML frontmatter delimited by --- */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a single detection file
 *
 * @param content - Raw file content
 * @param filePath - Path to the file (for error reporting and Detection.filePath)
 * @returns Parse result with detection or errors
 */
export function parseDetectionFile(
  content: string,
  filePath: string
): ParseResult {
  const errors: ParseError[] = [];

  // Check for frontmatter delimiters
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    // Try to give a more helpful error message
    if (!content.startsWith('---')) {
      return {
        success: false,
        errors: [
          {
            type: 'frontmatter_missing',
            message:
              'Detection file must start with YAML frontmatter delimited by ---',
            line: 1,
          },
        ],
      };
    }

    // Has opening --- but missing closing ---
    const closingIndex = content.indexOf('\n---', 4);
    if (closingIndex === -1) {
      return {
        success: false,
        errors: [
          {
            type: 'frontmatter_malformed',
            message: 'Missing closing --- delimiter for frontmatter',
            line: 1,
          },
        ],
      };
    }

    return {
      success: false,
      errors: [
        {
          type: 'frontmatter_malformed',
          message:
            'Invalid frontmatter format. Expected: ---\\n<yaml>\\n---\\n<query>',
        },
      ],
    };
  }

  const [, yamlContent, queryContent] = match;

  // Parse YAML
  let metadata: DetectionFrontmatter;
  try {
    const parsed = parseYaml(yamlContent);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        success: false,
        errors: [
          {
            type: 'yaml_invalid',
            message: 'Frontmatter must be a YAML object',
          },
        ],
      };
    }
    metadata = parsed as DetectionFrontmatter;
  } catch (e) {
    const yamlError = e as Error & { linePos?: [{ line: number; col: number }] };
    const line = yamlError.linePos?.[0]?.line;
    const col = yamlError.linePos?.[0]?.col;

    return {
      success: false,
      errors: [
        {
          type: 'yaml_invalid',
          message: `Invalid YAML: ${yamlError.message}`,
          line: line ? line + 1 : undefined, // +1 for the opening ---
          column: col,
        },
      ],
    };
  }

  // Normalize arrays - allow single string or array for mitre fields
  if (typeof metadata.mitre_tactics === 'string') {
    metadata.mitre_tactics = [metadata.mitre_tactics];
  }
  if (typeof metadata.mitre_techniques === 'string') {
    metadata.mitre_techniques = [metadata.mitre_techniques];
  }

  // Normalize tags
  if (typeof metadata.tags === 'string') {
    metadata.tags = [metadata.tags];
  }

  // Check for query
  const query = queryContent.trim();
  if (!query) {
    return {
      success: false,
      errors: [
        {
          type: 'query_missing',
          message: 'Detection file must include a query after the frontmatter',
        },
      ],
    };
  }

  return {
    success: true,
    detection: {
      filePath,
      metadata,
      query,
      raw: content,
    },
    errors,
  };
}

/**
 * Parse multiple detection files
 *
 * @param files - Array of file paths and contents
 * @returns Map of file path to parse result
 */
export function parseMultipleFiles(
  files: Array<{ path: string; content: string }>
): Map<string, ParseResult> {
  const results = new Map<string, ParseResult>();
  for (const file of files) {
    results.set(file.path, parseDetectionFile(file.content, file.path));
  }
  return results;
}

/**
 * Serialize a detection back to file format
 *
 * @param detection - Detection to serialize
 * @returns File content as string
 */
export function serializeDetection(detection: Detection): string {
  const { stringify } = require('yaml') as { stringify: (obj: unknown) => string };
  const yaml = stringify(detection.metadata);
  return `---\n${yaml}---\n${detection.query}\n`;
}
