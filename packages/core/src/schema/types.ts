/**
 * Detection schema types for NanoSIEM
 * These types match the NanoSIEM API schema defined in nanosiem-web/src/lib/api/types.ts
 */

/** Severity levels for detection rules */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

/** Rule lifecycle mode */
export type RuleMode = 'staging' | 'live' | 'alerting';

/** Detection execution mode */
export type DetectionMode = 'real-time' | 'scheduled';

/**
 * AI triage hints help analysts identify false positives vs true positives
 * These hints are used by the AI triage system and displayed to analysts
 */
export interface AiTriageHints {
  /** Conditions indicating benign/expected activity (false positive indicators) */
  ignore_when: string[];
  /** Conditions indicating especially suspicious activity (true positive indicators) */
  suspicious_when: string[];
  /** Additional context about this detection for the AI and analysts */
  context?: string;
}

/** Case visibility levels for cases created by this rule */
export type CaseVisibility = 'public' | 'group' | 'private';

/** Auto-tuning mode for detection rules */
export type AutoTuningMode = 'off' | 'proposals' | 'auto_approve';

/**
 * Auto-tuning configuration for detection rules
 * Controls how AI-driven tuning behaves for this rule
 */
export interface AutoTuningConfig {
  /** Whether auto-tuning is enabled for this rule (default: true) */
  enabled?: boolean;
  /** Minimum AI confidence score required to consider a tuning proposal (0.0-1.0, default: 0.8) */
  min_confidence?: number;
  /** If true, prevents auto-tuning regardless of other settings (for critical rules) */
  critical?: boolean;
  /** How tuning proposals are handled: 'off', 'proposals' (require approval), or 'auto_approve' */
  mode?: AutoTuningMode;
}

/**
 * UDM field requirements for a detection rule
 * Used for coverage analysis and validation
 */
export interface RequiresConfig {
  /** UDM fields required for this detection to work */
  fields: string[];
  /** Suggested source types that typically provide these fields */
  source_types?: string[];
}

/**
 * Repository metadata for imported rules
 * Set automatically during import, not user-authored
 */
export interface RepositoryMetadata {
  /** Repository slug (e.g., "sigma-hq/sigma") */
  source: string;
  /** Rule path within the repository */
  rule_id: string;
  /** Commit SHA when imported/last synced */
  commit: string;
  /** Whether this rule stays in sync with upstream changes */
  linked: boolean;
}

/**
 * YAML frontmatter schema for detection files
 * This is the format users write in their .yaml detection files
 */
export interface DetectionFrontmatter {
  /** Detection name/title (required) */
  title: string;
  /** Description of what the detection finds */
  description?: string;
  /** Author name or email */
  author?: string;
  /** Severity level */
  severity: Severity;
  /** Rule lifecycle mode */
  mode: RuleMode;
  /** Detection execution mode */
  detection_mode: DetectionMode;
  /** Cron schedule for scheduled detections (e.g., every minute: "* 1 * * * *") */
  schedule?: string;
  /** Lookback period (e.g., "15m", "1h", "24h") */
  lookback?: string;
  /** MITRE ATT&CK tactics (single or array, e.g., "TA0011" or ["TA0011", "TA0001"]) */
  mitre_tactics?: string | string[];
  /** MITRE ATT&CK techniques (single or array, e.g., "T1071" or ["T1071", "T1059.001"]) */
  mitre_techniques?: string | string[];
  /** Tags for categorization */
  tags?: string[];
  /** Reference URL for more information about the threat */
  reference_url?: string;
  /** Whether real-time detection is enabled (for real-time mode) */
  realtime_enabled?: boolean;
  /** AI triage hints for false positive identification */
  ai_triage_hints?: AiTriageHints;
  /** Whether this detection should be enabled on deploy (default: true) */
  enabled?: boolean;
  /** Case visibility for cases created by this rule */
  case_visibility?: CaseVisibility;
  /** Group slugs for case permissions (when visibility = 'group') */
  case_groups?: string[];
  /** Auto-tuning configuration */
  auto_tuning?: AutoTuningConfig;
  /** UDM field requirements */
  requires?: RequiresConfig;
  /** Repository metadata (set by import, not user-authored) */
  _repository?: RepositoryMetadata;
}

/**
 * Complete parsed detection file
 * Combines the frontmatter metadata with the query body
 */
export interface Detection {
  /** File path relative to detections directory */
  filePath: string;
  /** Parsed frontmatter metadata */
  metadata: DetectionFrontmatter;
  /** Query body (SPL-like query after frontmatter) */
  query: string;
  /** Raw file content (for diffing) */
  raw: string;
}

/**
 * Detection payload ready to send to NanoSIEM API
 * Normalized version of Detection for API compatibility
 */
export interface DetectionApiPayload {
  /** Detection name (from title) */
  name: string;
  /** Description */
  description?: string;
  /** SPL-like query */
  query: string;
  /** Severity level */
  severity: Severity;
  /** Rule lifecycle mode */
  mode: RuleMode;
  /** Detection execution mode */
  detection_mode: DetectionMode;
  /** Cron schedule expression */
  schedule_cron?: string;
  /** Lookback period in minutes */
  lookback_minutes?: number;
  /** MITRE ATT&CK tactics (normalized to array) */
  mitre_tactics: string[];
  /** MITRE ATT&CK techniques (normalized to array) */
  mitre_techniques: string[];
  /** Tags */
  tags: string[];
  /** Reference URL */
  reference_url?: string;
  /** Author */
  author?: string;
  /** Real-time enabled */
  realtime_enabled?: boolean;
  /** AI triage hints */
  ai_triage_hints?: AiTriageHints;
  /** Whether detection is enabled */
  enabled?: boolean;
  /** Case visibility for cases created by this rule */
  case_visibility?: CaseVisibility;
  /** Group slugs for case permissions */
  case_groups?: string[];
  /** Auto-tuning configuration */
  auto_tuning?: AutoTuningConfig;
  /** UDM field requirements */
  requires?: RequiresConfig;
  /** Repository source (for linked/forked rules) */
  source_repository_slug?: string;
  /** Rule path in source repository */
  source_rule_path?: string;
  /** Whether the rule is linked to upstream */
  source_linked?: boolean;
}

/**
 * Detection rule returned from NanoSIEM API
 * Includes server-generated fields like id, created_at, etc.
 */
export interface DetectionRule extends DetectionApiPayload {
  /** Unique rule ID (UUID) */
  id: string;
  /** Whether the rule is currently enabled */
  enabled: boolean;
  /** Materialized view name (for real-time detections) */
  materialized_view_name?: string;
  /** AI-generated narrative explaining the detection */
  narrative?: string;
  /** Whether this rule was AI-generated */
  ai_generated?: boolean;
  /** Whether this rule is archived */
  archived?: boolean;
  /** Timestamp when rule was created */
  created_at: string;
  /** Timestamp when rule was last updated */
  updated_at: string;
  /** Timestamp when rule last ran */
  last_run_at?: string;
  /** Timestamp when rule last matched */
  last_match_at?: string;
  /** Total match count */
  match_count: number;
  /** Match count during live/bake-in mode */
  live_match_count?: number;
}

/**
 * Response from create/update operations that may include warnings
 */
export interface DetectionResponse extends DetectionRule {
  /** Warning message from backend (e.g., auto-correction from real-time to scheduled) */
  warning?: string;
}

/**
 * Daily match count for trend analysis
 */
export interface DailyMatchCount {
  date: string;
  count: number;
}

/**
 * Historical analysis result from testing a detection
 */
export interface HistoricalAnalysisResult {
  /** Rule ID (if testing existing rule) */
  rule_id?: string;
  /** Rule name */
  rule_name?: string;
  /** Time range analyzed */
  time_range?: {
    start: string;
    end: string;
  };
  /** Total matches found */
  total_matches: number;
  /** Sample events from matches */
  sample_events: Record<string, unknown>[];
  /** Matches grouped by day */
  matches_by_day?: DailyMatchCount[];
  /** Execution time in milliseconds */
  execution_time_ms?: number;
}

/**
 * Search result from executing a query
 */
export interface SearchResult {
  /** Matching records */
  results: Record<string, unknown>[];
  /** Total count of matches */
  total_count: number;
  /** Query execution time in milliseconds */
  execution_time_ms: number;
  /** Generated SQL (if requested) */
  generated_sql?: string;
}

