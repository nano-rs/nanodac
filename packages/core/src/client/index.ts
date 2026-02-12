/**
 * NanoSIEM API client
 *
 * Handles communication with the NanoSIEM detection and search APIs
 */

import type {
  Detection,
  DetectionApiPayload,
  DetectionRule,
  DetectionResponse,
  HistoricalAnalysisResult,
  SearchResult,
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
    return this.request<DetectionRule[]>('GET', '/api/detections');
  }

  /**
   * Get a single detection rule by ID
   */
  async getDetection(id: string): Promise<ApiResponse<DetectionRule>> {
    return this.request<DetectionRule>('GET', `/api/detections/${id}`);
  }

  /**
   * Create a new detection rule
   */
  async createDetection(
    payload: DetectionApiPayload
  ): Promise<ApiResponse<DetectionResponse>> {
    return this.request<DetectionResponse>('POST', '/api/detections', payload);
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
      `/api/detections/${id}`,
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
      `/api/detections/${id}`
    );
  }

  /**
   * Enable a detection rule
   */
  async enableDetection(id: string): Promise<ApiResponse<DetectionRule>> {
    return this.request<DetectionRule>('POST', `/api/detections/${id}/enable`);
  }

  /**
   * Disable a detection rule
   */
  async disableDetection(id: string): Promise<ApiResponse<DetectionRule>> {
    return this.request<DetectionRule>('POST', `/api/detections/${id}/disable`);
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
      `/api/detections/${id}/test`,
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
      '/api/detections/test',
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
    enabled: metadata.enabled,
    alert_mode: metadata.alert_mode,
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
    enabled: rule.enabled,
    alert_mode: rule.alert_mode,
  };

  return {
    filePath,
    metadata,
    query: rule.query,
    raw: '', // Not available from API
  };
}
