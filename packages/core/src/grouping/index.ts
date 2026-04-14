/**
 * Event grouping logic for alert_mode=grouped detection testing
 *
 * Matches the in-product rule tester's bucketing behavior:
 * events are grouped into clock-aligned windows based on lookback_minutes,
 * and each bucket surfaces the dominant entity.
 */

import type { GroupedTestBucket } from '../schema/types.js';

/**
 * Entity fields scanned in priority order for dominant entity detection.
 * Matches the in-product rule tester's ENTITY_FIELDS list.
 */
export const ENTITY_FIELDS_PRIORITY = [
  'src_ip',
  'dest_ip',
  'user',
  'src_user',
  'dest_user',
  'src_host',
  'dest_host',
  'host',
  'hostname',
  'process_name',
  'file_hash',
  'process_hash',
] as const;

/**
 * Get the dominant entity from a set of events.
 * Scans entity fields in priority order, returns the most frequent value
 * from the first field that has any values.
 */
export function getDominantEntity(
  events: Record<string, unknown>[]
): GroupedTestBucket['dominant_entity'] {
  for (const field of ENTITY_FIELDS_PRIORITY) {
    const counts = new Map<string, number>();

    for (const event of events) {
      const val = event[field];
      if (val !== undefined && val !== null && val !== '') {
        const key = String(val);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    if (counts.size > 0) {
      let maxVal = '';
      let maxCount = 0;
      for (const [val, count] of counts) {
        if (count > maxCount) {
          maxVal = val;
          maxCount = count;
        }
      }
      return {
        field,
        value: maxVal,
        others_count: counts.size - 1,
      };
    }
  }

  return null;
}

/**
 * Bucket events into clock-aligned time windows based on lookback minutes.
 *
 * Uses the same algorithm as the in-product rule tester:
 *   windowStart = Math.floor(epochMs / windowMs) * windowMs
 *
 * This aligns windows to clock boundaries (e.g., 14:45, 15:00, 15:15 for 15m windows)
 * matching how the cron scheduler fires in production.
 */
export function bucketEventsByLookback(
  events: Record<string, unknown>[],
  lookbackMinutes: number
): GroupedTestBucket[] {
  if (events.length === 0 || lookbackMinutes <= 0) return [];

  const windowMs = lookbackMinutes * 60 * 1000;
  const bucketMap = new Map<number, Record<string, unknown>[]>();

  for (const event of events) {
    const ts = event.timestamp || event.ingest_time || event._nano_detected_at;
    if (!ts) continue;

    const epochMs = new Date(String(ts)).getTime();
    if (isNaN(epochMs)) continue;

    const windowStart = Math.floor(epochMs / windowMs) * windowMs;
    if (!bucketMap.has(windowStart)) bucketMap.set(windowStart, []);
    bucketMap.get(windowStart)!.push(event);
  }

  // Sort by window start time (most recent first)
  const sorted = [...bucketMap.entries()].sort((a, b) => b[0] - a[0]);

  return sorted.map(([windowStartMs, bucketEvents]) => ({
    window_start: new Date(windowStartMs).toISOString(),
    window_end: new Date(windowStartMs + windowMs).toISOString(),
    event_count: bucketEvents.length,
    dominant_entity: getDominantEntity(bucketEvents),
    sample_events: bucketEvents.slice(0, 3),
  }));
}
