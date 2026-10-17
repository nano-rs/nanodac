import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDetectionFile } from '../parser/index.js';
import { validateDetection } from '../validator/index.js';
import { NanosiemClient } from './index.js';
import fixture from '../fixtures/lean.json';
import { bucketEventsByLookback, getDominantEntity, getFieldValue } from '../grouping/index.js';

const client = () => new NanosiemClient({ apiUrl: 'https://api.invalid/', searchUrl: 'https://search.invalid/', apiKey: 'fixture-key' });
afterEach(() => vi.unstubAllGlobals());
describe('lean OCSF contract', () => {
  it('accepts canonical dotted required fields without format warnings', () => {
    const parsed = parseDetectionFile(`---
title: auth_test
severity: high
mode: staging
detection_mode: scheduled
schedule: "*/5 * * * *"
lookback: 15m
requires:
  fields: [src_endpoint.ip, user.name, process.cmd_line]
---
class_uid=3002 | stats count() by src_endpoint.ip`, 'test.yaml');
    const validation = validateDetection(parsed.detection!);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.filter(w => w.field === 'requires.fields')).toEqual([]);
  });
  it('uses the lean search service and preserves bounded counts and pagination', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture.search)));
    vi.stubGlobal('fetch', fetcher);
    const result = await client().search('class_uid=3002 | table time, src_endpoint.ip', { start: '2026-10-17T00:00:00Z', end: '2026-10-17T01:00:00Z' }, { limit: 1 });
    expect(result.data).toEqual(fixture.search);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://search.invalid/api/search');
    expect(init.headers['X-API-Key']).toBe('fixture-key');
    expect(JSON.parse(init.body)).toMatchObject({ dataset: 'logs', skip_histogram: true, skip_field_stats: true, limit: 1 });
  });
  it('rejects noncanonical and older schema catalogs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...fixture.schema, strict_canonical_fields: false }))));
    expect((await client().getSchema()).error?.code).toBe('UNSUPPORTED_SCHEMA');
  });
  it('sends an exact backtest range and the authored schedule/lookback', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const timeRange = { start: '2026-10-17T00:00:00Z', end: '2026-10-17T01:00:00Z' };
    await client().testQuery('class_uid=3002', 7, { timeRange, scheduleCron: '*/10 * * * *', lookbackMinutes: 30 });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ query: 'class_uid=3002', days: 7, time_range: timeRange, schedule_cron: '*/10 * * * *', lookback_minutes: 30, dataset: 'logs' });
  });
  it('groups nested OCSF rows by millisecond time and canonical entity paths', () => {
    const rows = fixture.search.results;
    const buckets = bucketEventsByLookback(rows, 15);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].window_start).toBe(new Date(Math.floor(rows[0].time / 900000) * 900000).toISOString());
    expect(getDominantEntity(rows)).toEqual({ field: 'src_endpoint.ip', value: '192.0.2.1', others_count: 0 });
    expect(getFieldValue({ file: { hashes: [{ value: 'abc' }, { value: 'def' }] } }, 'file.hashes.value')).toEqual(['abc', 'def']);
    expect(getDominantEntity([{ 'src_endpoint.ip': '192.0.2.2' }])?.value).toBe('192.0.2.2');
    expect(getDominantEntity([{ file: { hashes: [{ value: 'abc' }, { value: 'def' }] } }])).toEqual({ field: 'file.hashes.value', value: 'abc', others_count: 1 });
  });
});
