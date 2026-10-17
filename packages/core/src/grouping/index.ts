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
  'src_endpoint.ip', 'dst_endpoint.ip', 'user.name', 'actor.user.name',
  'user.uid', 'actor.user.uid', 'src_endpoint.hostname', 'dst_endpoint.hostname',
  'device.hostname', 'file.hashes.value', 'process.file.hashes.value',
  'actor.process.file.hashes.value', 'http_request.url.hostname',
] as const;

/** Read canonical paths from flat query rows or nested OCSF objects. */
export function getFieldValue(event: Record<string, unknown>, path: string): unknown {
  if (Object.hasOwn(event, path)) return event[path];
  const descend = (value: unknown, parts: string[]): unknown => {
    if (Array.isArray(value)) return value.flatMap(item => {
      const leaf = descend(item, parts);
      return leaf === undefined ? [] : [leaf];
    });
    if (!parts.length) return value;
    if (!value || typeof value !== 'object') return undefined;
    return descend((value as Record<string, unknown>)[parts[0]], parts.slice(1));
  };
  return descend(event, path.split('.'));
}

/** Flatten nested OCSF leaves for CLI field selection and rendering. */
export function flattenEvent(event: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const visit = (value: unknown, path: string) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
    } else flat[path] = value;
  };
  visit(event, '');
  return flat;
}

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
      const val = getFieldValue(event, field);
      for (const leaf of Array.isArray(val) ? val : [val]) {
        if (leaf !== undefined && leaf !== null && leaf !== '') {
          const key = String(leaf);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
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
    const ts = getFieldValue(event, 'time');
    if (!ts) continue;

    const epochMs = new Date(typeof ts === 'number' ? ts : String(ts)).getTime();
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
