/**
 * Detection schema types for NanoSIEM
 * These types match the NanoSIEM API schema defined in nanosiem-web/src/lib/api/types.ts
 */

/** Severity levels for detection rules */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

/** Rule lifecycle mode */
export type RuleMode = 'staging' | 'live' | 'alerting' | 'paused';

/** Detection execution mode */
export type DetectionMode = 'real-time' | 'scheduled';

/** Alert mode for how matched events map to alerts */
export type AlertMode = 'grouped' | 'per_event';

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
 * OCSF 1.9 field requirements for a detection rule
 * Used for coverage analysis and validation
 */
export interface RequiresConfig {
  /** OCSF 1.9 fields required for this detection to work */
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
  /** Bind an active rule to an ingestion source when the query spans sources. */
  source_slug?: string;
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
  /** Case visibility for cases created by this rule */
  case_visibility?: CaseVisibility;
  /** Group slugs for case permissions (when visibility = 'group') */
  case_groups?: string[];
  /** Alert mode: grouped (all matches → 1 alert) or per_event (each match → 1 alert) */
  alert_mode?: AlertMode;
  /** Organizational folder (e.g., "identity", "endpoint", "network", "cloud") */
  folder?: string;
  /** Auto-tuning configuration */
  auto_tuning?: AutoTuningConfig;
  /** OCSF 1.9 field requirements */
  requires?: RequiresConfig;
  /**
   * Playbook auto-attach mode for alerts produced by this rule.
   *   'none'     — no playbook (default)
   *   'specific' — attach `playbook_id` at case-creation time
   *   'adaptive' — let the Shadow Investigator compose on investigation wrap
   *
   * Prefer the `playbook:` shorthand below for new rules — this two-field
   * form is kept so older rules keep parsing.
   */
  playbook_selector_mode?: 'none' | 'specific' | 'adaptive';
  /** Library playbook id (typeid `pb_...`) — required when `playbook_selector_mode` is 'specific' */
  playbook_id?: string;
  /**
   * Shorthand for `playbook_selector_mode` + `playbook_id`. When set, wins
   * over the two-field form above. Encoded as:
   *   omitted / "" / "none"  — mode='none'
   *   "adaptive"             — Shadow Investigator composes on wrap
   *   "pb_<typeid>"          — attach that specific library playbook
   */
  playbook?: string;
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
  /** Query body (nPL query after frontmatter) */
  query: string;
  /** Raw file content (for diffing) */
  raw: string;
}

/**
 * Detection payload ready to send to NanoSIEM API
 * Normalized version of Detection for API compatibility
 */
export interface DetectionApiPayload {
  /** Ingestion source binding accepted by lean authoring. */
  source_slug?: string;
  /** Detection name (from title) */
  name: string;
  /** Description */
  description?: string;
  /** nPL query */
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
  /** Case visibility for cases created by this rule */
  case_visibility?: CaseVisibility;
  /** Group IDs for case permissions (UUIDs, when case_visibility = 'group') */
  case_group_ids?: string[];
  /** Alert mode: grouped (all matches → 1 alert) or per_event (each match → 1 alert) */
  alert_mode?: AlertMode;
  /** Organizational folder (e.g., "identity", "endpoint", "network", "cloud") */
  folder?: string;
  /** Whether auto-tuning is enabled for this rule */
  auto_tuning_enabled?: boolean;
  /** Minimum AI confidence score for tuning proposals (0.0-1.0) */
  auto_tuning_min_confidence?: number;
  /** If true, prevents auto-tuning regardless of other settings */
  auto_tuning_critical?: boolean;
  /** OCSF 1.9 field requirements (local-only, not sent to API) */
  requires?: RequiresConfig;
  /** Repository source (for linked/forked rules) */
  source_repository_slug?: string;
  /** Rule path in source repository */
  source_rule_path?: string;
  /** Whether the rule is linked to upstream */
  source_linked?: boolean;
  /**
   * Detection-as-Code provenance (NAN-1764): repo-root-relative path of this
   * rule's file in the DaC repo. Sent by `nanodac sync` so nano's tuning PRs
   * target the exact file instead of a name-templated duplicate. Distinct from
   * `source_rule_path` above, which is nano's internal curated-pull-feed model.
   */
  source_path?: string;
  /** Detection-as-Code provenance (NAN-1764): repo URL this rule was synced from. */
  source_repo_url?: string;
  /** Playbook auto-attach mode: 'none' | 'specific' | 'adaptive' */
  playbook_selector_mode?: 'none' | 'specific' | 'adaptive';
  /** Library playbook id when selector mode is 'specific' */
  playbook_id?: string | null;
}

/**
 * Detection rule returned from NanoSIEM API
 * Includes server-generated fields like id, created_at, etc.
 */
export interface DetectionRule extends DetectionApiPayload {
  /** Unique rule ID (API TypeID) */
  id: string;
  execution_mode?: 'scheduled' | 'near_real_time';
  near_real_time_interval_seconds?: number;
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
  failed_windows?: number;
  error_sample?: string;
  matches_by_bucket?: Array<{ bucket_start: string; count: number }>;
  bucket_size_seconds?: number;
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
  /** False means total_count is a lower bound. */
  total_count_exact: boolean;
  has_more: boolean;
  next_offset: number | null;
  warnings?: string[];
  /** Generated SQL (if requested) */
  generated_sql?: string;
}

/**
 * Response from server-side query validation
 */
export interface ValidateDetectionResponse {
  /** Whether the query is valid */
  valid: boolean;
  /** The effective detection mode after auto-correction */
  effective_mode: string;
  execution_mode: 'scheduled' | 'near_real_time';
  near_real_time_interval_seconds?: number;
  /** Whether a materialized view will be created */
  creates_materialized_view: boolean;
  /** Explanation of mode selection */
  mode_reason: string;
  /** Warning about auto-correction */
  warning?: string;
  /** Validation errors */
  errors: string[];
  /** Fields referenced in the query */
  referenced_fields: string[];
}

/**
 * Response from query formatting
 */
export interface FormatQueryResponse {
  formatted_query: string;
}

/**
 * Detection match record from /rules/{id}/matches
 */
export interface DetectionMatch {
  id: string;
  detected_at: string;
  severity: string;
  status: string;
  event_count: number;
  events: Record<string, unknown>[];
}

/**
 * Paginated detection matches response
 */
export interface DetectionMatchesResponse {
  total: number;
  matches: DetectionMatch[];
}

/**
 * Bulk update rules request
 */
export interface BulkUpdateRulesRequest {
  rule_ids: string[];
  mode: string;
}

/**
 * Bulk update rules response
 */
export interface BulkUpdateRulesResponse {
  updated: number;
  skipped: number;
  failed: Array<{ rule_id: string; error: string }>;
}

/**
 * Import rules response
 */
export interface ImportRulesResponse {
  imported: number;
  failed: number;
  errors: string[];
}

/**
 * Grouped test result bucket for alert_mode=grouped
 * Matches the in-product rule tester's bucketing behavior
 */
export interface GroupedTestBucket {
  /** Window start time (ISO 8601) */
  window_start: string;
  /** Window end time (ISO 8601) */
  window_end: string;
  /** Number of events in this bucket */
  event_count: number;
  /** Most frequent entity in this bucket */
  dominant_entity: {
    field: string;
    value: string;
    others_count: number;
  } | null;
  /** Sample events from this bucket */
  sample_events: Record<string, unknown>[];
}


/** Canonical tenant field catalog from /api/schema/fields. */
export interface SchemaFieldsResponse {
  schema: string;
  schema_version: string;
  strict_canonical_fields: boolean;
  fields: Array<{ name: string; type: string; category: string; entity_type?: string; prewhere: boolean; search: boolean }>;
}

/** Manual execution is queued for the tenant detection runtime. */
export interface TriggerDetectionResponse {
  triggered: boolean;
  rule_id: string;
  execution: 'queued';
  execution_mode: 'scheduled' | 'near_real_time';
  near_real_time_interval_seconds?: number;
  scheduled_for: string;
  window_start: string;
}
