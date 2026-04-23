/**
 * NanoSIEM API client
 *
 * Handles communication with the NanoSIEM detection and search APIs
 */

import type {
  Detection,
  DetectionApiPayload,
  DetectionFrontmatter,
  DetectionRule,
  DetectionResponse,
  HistoricalAnalysisResult,
  SearchResult,
  ValidateDetectionResponse,
  FormatQueryResponse,
  DetectionMatchesResponse,
  BulkUpdateRulesResponse,
  ImportRulesResponse,
} from '../schema/types.js';
import { parseLookbackToMinutes } from '../validator/index.js';

/** Client configuration */
export interface NanosiemClientConfig {
  /** NanoSIEM API base URL (e.g., "https://nanosiem.example.com:3001") */
  apiUrl: string;
  /** Search service URL (e.g., "https://nanosiem.example.com:3002") */
  searchUrl?: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/** API response wrapper */
export interface ApiResponse<T> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response data (if successful) */
  data?: T;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * NanoSIEM API client
 */
export class NanosiemClient {
  private apiUrl: string;
  private searchUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: NanosiemClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.searchUrl = config.searchUrl?.replace(/\/$/, '') || this.apiUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Make an API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    useSearchUrl = false
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const baseUrl = useSearchUrl ? this.searchUrl : this.apiUrl;

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message:
              (errorBody as { error?: { message?: string } }).error?.message ||
              (errorBody as { message?: string }).message ||
              response.statusText,
            details: errorBody as Record<string, unknown>,
          },
        };
      }

      const data = (await response.json()) as T;
      return { success: true, data };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `Request timed out after ${this.timeout}ms`,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  // ==================== Detection Endpoints ====================

  /**
   * List all detection rules
   */
  async listDetections(): Promise<ApiResponse<DetectionRule[]>> {
    return this.request<DetectionRule[]>('GET', '/api/rules');
  }

  /**
   * Get a single detection rule by ID
   */
  async getDetection(id: string): Promise<ApiResponse<DetectionRule>> {
    return this.request<DetectionRule>('GET', `/api/rules/${id}`);
  }

  /**
   * Create a new detection rule
   */
  async createDetection(
    payload: DetectionApiPayload
  ): Promise<ApiResponse<DetectionResponse>> {
    return this.request<DetectionResponse>('POST', '/api/rules', payload);
  }

  /**
   * Update an existing detection rule
   */
  async updateDetection(
    id: string,
    payload: Partial<DetectionApiPayload>
  ): Promise<ApiResponse<DetectionResponse>> {
    return this.request<DetectionResponse>(
      'PUT',
      `/api/rules/${id}`,
      payload
    );
  }

  /**
   * Delete a detection rule
   */
  async deleteDetection(
    id: string
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>(
      'DELETE',
      `/api/rules/${id}`
    );
  }

  /**
   * Pause a detection rule (set mode to paused)
   */
  async pauseDetection(id: string): Promise<ApiResponse<DetectionRule>> {
    return this.request<DetectionRule>('POST', `/api/rules/${id}/pause`);
  }

  /**
   * Resume a paused detection rule (set mode back to alerting)
   */
  async resumeDetection(id: string): Promise<ApiResponse<DetectionRule>> {
    return this.request<DetectionRule>('POST', `/api/rules/${id}/resume`);
  }

  /**
   * Test a detection rule against historical data
   */
  async testDetection(
    id: string,
    days?: number
  ): Promise<ApiResponse<HistoricalAnalysisResult>> {
    return this.request<HistoricalAnalysisResult>(
      'POST',
      `/api/rules/${id}/test`,
      { days: days ?? 7 }
    );
  }

  /**
   * Test a query without creating a detection
   */
  async testQuery(
    query: string,
    days?: number
  ): Promise<ApiResponse<HistoricalAnalysisResult>> {
    return this.request<HistoricalAnalysisResult>(
      'POST',
      '/api/rules/test',
      { query, days: days ?? 7 }
    );
  }

  // ==================== Search Endpoints ====================

  /**
   * Execute a search query
   */
  async search(
    query: string,
    timeRange: { start: string; end: string },
    options?: { limit?: number; includeSQL?: boolean }
  ): Promise<ApiResponse<SearchResult>> {
    return this.request<SearchResult>(
      'POST',
      '/api/search',
      {
        query,
        time_range: timeRange,
        limit: options?.limit,
        include_sql: options?.includeSQL,
      },
      true // Use search URL
    );
  }

  // ==================== Health Check ====================

  /**
   * Check API health
   */
  async healthCheck(): Promise<
    ApiResponse<{ status: string; version?: string }>
  > {
    return this.request<{ status: string; version?: string }>('GET', '/health');
  }

  // ==================== Rule Lifecycle ====================

  /**
   * Promote a rule (staging -> live -> alerting)
   */
  async promoteDetection(id: string): Promise<ApiResponse<DetectionRule>> {
    return this.request<DetectionRule>('POST', `/api/rules/${id}/promote`);
  }

  /**
   * Demote a rule (alerting -> live)
   */
  async demoteDetection(id: string): Promise<ApiResponse<DetectionRule>> {
    return this.request<DetectionRule>('POST', `/api/rules/${id}/demote`);
  }

  /**
   * Manually trigger a rule to execute now
   */
  async triggerDetection(
    id: string
  ): Promise<ApiResponse<{ triggered: boolean; rule_id: string }>> {
    return this.request<{ triggered: boolean; rule_id: string }>(
      'POST',
      `/api/rules/${id}/trigger`
    );
  }

  // ==================== Query Tools ====================

  /**
   * Validate a query using server-side validation
   */
  async validateQuery(
    query: string,
    detectionMode?: string
  ): Promise<ApiResponse<ValidateDetectionResponse>> {
    return this.request<ValidateDetectionResponse>('POST', '/api/rules/validate', {
      query,
      detection_mode: detectionMode,
    });
  }

  /**
   * Format a query with pretty-printing
   */
  async formatQuery(query: string): Promise<ApiResponse<FormatQueryResponse>> {
    return this.request<FormatQueryResponse>('POST', '/api/rules/format', {
      query,
    });
  }

  // ==================== Matches & Stats ====================

  /**
   * Get detection matches for a rule
   */
  async getMatches(
    id: string,
    params?: { limit?: number; offset?: number; start_time?: string; end_time?: string }
  ): Promise<ApiResponse<DetectionMatchesResponse>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.start_time) query.set('start_time', params.start_time);
    if (params?.end_time) query.set('end_time', params.end_time);
    const qs = query.toString();
    return this.request<DetectionMatchesResponse>(
      'GET',
      `/api/rules/${id}/matches${qs ? `?${qs}` : ''}`
    );
  }

  /**
   * Get detection stats (match counts by day)
   */
  async getStats(
    days?: number
  ): Promise<ApiResponse<Record<string, unknown>>> {
    const qs = days ? `?days=${days}` : '';
    return this.request<Record<string, unknown>>('GET', `/api/rules/stats${qs}`);
  }

  // ==================== Bulk Operations ====================

  /**
   * Bulk update rule modes
   */
  async bulkUpdate(
    ruleIds: string[],
    mode: string
  ): Promise<ApiResponse<BulkUpdateRulesResponse>> {
    return this.request<BulkUpdateRulesResponse>('POST', '/api/rules/bulk-update', {
      rule_ids: ruleIds,
      mode,
    });
  }

  /**
   * Import rules in bulk
   */
  async importRules(
    rules: DetectionApiPayload[]
  ): Promise<ApiResponse<ImportRulesResponse>> {
    return this.request<ImportRulesResponse>('POST', '/api/rules/import', {
      rules,
    });
  }

  /**
   * Export all rules
   */
  async exportRules(): Promise<ApiResponse<DetectionRule[]>> {
    return this.request<DetectionRule[]>('GET', '/api/rules/export');
  }

}

// ==================== Conversion Utilities ====================

/**
 * Convert a parsed Detection to API payload format
 */
export function detectionToApiPayload(detection: Detection): DetectionApiPayload {
  const { metadata, query } = detection;

  // Parse lookback to minutes
  let lookbackMinutes: number | undefined;
  if (metadata.lookback) {
    lookbackMinutes = parseLookbackToMinutes(metadata.lookback);
  }

  // Normalize arrays
  const mitreTactics = Array.isArray(metadata.mitre_tactics)
    ? metadata.mitre_tactics
    : metadata.mitre_tactics
      ? [metadata.mitre_tactics]
      : [];

  const mitreTechniques = Array.isArray(metadata.mitre_techniques)
    ? metadata.mitre_techniques
    : metadata.mitre_techniques
      ? [metadata.mitre_techniques]
      : [];

  return {
    name: metadata.title,
    description: metadata.description,
    query,
    severity: metadata.severity,
    mode: metadata.mode,
    detection_mode: metadata.detection_mode,
    schedule_cron: metadata.schedule,
    lookback_minutes: lookbackMinutes,
    mitre_tactics: mitreTactics,
    mitre_techniques: mitreTechniques,
    tags: metadata.tags ?? [],
    reference_url: metadata.reference_url,
    author: metadata.author,
    realtime_enabled: metadata.realtime_enabled,
    ai_triage_hints: metadata.ai_triage_hints,
    alert_mode: metadata.alert_mode,
    folder: metadata.folder,
    case_visibility: metadata.case_visibility,
    case_group_ids: metadata.case_groups,
    // Flatten auto_tuning for API (server expects flat fields)
    auto_tuning_enabled: metadata.auto_tuning?.enabled,
    auto_tuning_min_confidence: metadata.auto_tuning?.min_confidence,
    auto_tuning_critical: metadata.auto_tuning?.critical,
    // Playbook auto-attach at firing time. Server enforces that
    // playbook_id is set iff selector_mode is 'specific'. Accepts either
    // the two-field form (`playbook_selector_mode` + `playbook_id`) or the
    // NAN-453 shorthand (`playbook:`). Shorthand wins when both are set.
    ...decodePlaybook(metadata),
  };
}

function decodePlaybook(metadata: DetectionFrontmatter): {
  playbook_selector_mode: 'none' | 'specific' | 'adaptive' | undefined;
  playbook_id: string | null;
} {
  const shorthand = metadata.playbook?.trim();
  if (shorthand !== undefined) {
    if (shorthand === '' || shorthand === 'none') {
      return { playbook_selector_mode: 'none', playbook_id: null };
    }
    if (shorthand === 'adaptive') {
      return { playbook_selector_mode: 'adaptive', playbook_id: null };
    }
    if (/^pb_[0-9a-z]+$/i.test(shorthand)) {
      return { playbook_selector_mode: 'specific', playbook_id: shorthand };
    }
    // Unrecognised — fall through to two-field form below. Don't throw;
    // sync-time errors are opaque. The server will reject if it's garbage.
  }
  return {
    playbook_selector_mode: metadata.playbook_selector_mode,
    playbook_id:
      metadata.playbook_selector_mode === 'specific'
        ? (metadata.playbook_id ?? null)
        : null,
  };
}

/**
 * Convert an API DetectionRule back to Detection format (for diffing)
 */
export function detectionRuleToDetection(
  rule: DetectionRule,
  filePath: string
): Detection {
  // Convert lookback_minutes back to string format
  let lookback: string | undefined;
  if (rule.lookback_minutes) {
    if (rule.lookback_minutes >= 1440 && rule.lookback_minutes % 1440 === 0) {
      lookback = `${rule.lookback_minutes / 1440}d`;
    } else if (rule.lookback_minutes >= 60 && rule.lookback_minutes % 60 === 0) {
      lookback = `${rule.lookback_minutes / 60}h`;
    } else {
      lookback = `${rule.lookback_minutes}m`;
    }
  }

  const metadata = {
    title: rule.name,
    description: rule.description,
    author: rule.author,
    severity: rule.severity,
    mode: rule.mode,
    detection_mode: rule.detection_mode,
    schedule: rule.schedule_cron,
    lookback,
    mitre_tactics: rule.mitre_tactics,
    mitre_techniques: rule.mitre_techniques,
    tags: rule.tags,
    reference_url: rule.reference_url,
    realtime_enabled: rule.realtime_enabled,
    ai_triage_hints: rule.ai_triage_hints,
    alert_mode: rule.alert_mode,
    folder: rule.folder,
    case_visibility: rule.case_visibility,
    case_groups: rule.case_group_ids as string[] | undefined,
    // Reconstruct nested auto_tuning from flat API fields
    auto_tuning:
      rule.auto_tuning_enabled !== undefined ||
      rule.auto_tuning_min_confidence !== undefined ||
      rule.auto_tuning_critical !== undefined
        ? {
            enabled: rule.auto_tuning_enabled,
            min_confidence: rule.auto_tuning_min_confidence,
            critical: rule.auto_tuning_critical,
          }
        : undefined,
  };

  return {
    filePath,
    metadata,
    query: rule.query,
    raw: '', // Not available from API
  };
}
