import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleToolCall, TOOLS } from './index.js';
const catalog = { schema: 'ocsf', schema_version: '1.9.0', strict_canonical_fields: true, fields: [{ name: 'src_endpoint.ip', type: 'ip_address' }] };
beforeEach(() => {
  vi.stubEnv('NANOSIEM_API_URL', 'https://api.invalid');
  vi.stubEnv('NANOSIEM_API_KEY', 'fixture-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('get_schema publishes the tenant catalog with canonical examples', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog)));
  vi.stubGlobal('fetch', fetcher);
  const result = await handleToolCall('get_schema', {});
  expect(result.isError).toBeUndefined();
  expect(result.content[0].text).toContain('src_endpoint.ip');
  expect(JSON.parse(result.content[1].text)).toEqual(catalog);
  expect(fetcher.mock.calls[0][0]).toMatch(/schema\/fields\?_=/);
});
it('starts a real hint job from saved query metadata and supports polling', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ query: 'class_uid=3002', severity: 'high', mitre_tactics: [], mitre_techniques: [] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ job_id: 'job-fixture', status: 'running' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ job_id: 'job-fixture', status: 'completed', result: { ignore_when: ['known scanner'] } })));
  vi.stubGlobal('fetch', fetcher);
  const result = await handleToolCall('generate_hints', { detection_id: 'rule-fixture' });
  expect(JSON.parse(result.content[0].text).job_id).toBe('job-fixture');
  expect(fetcher.mock.calls[1][0]).toBe('https://api.invalid/api/melod/detection/hints');
  expect(JSON.parse(fetcher.mock.calls[1][1].body).query).toBe('class_uid=3002');
  expect((await handleToolCall('get_hint_job', { job_id: 'job-fixture' })).isError).toBe(false);
});
it('resolves coverage names to repository IDs', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ repositories: [{ id: 'rr_fixture', name: 'OCSF', slug: 'nano-rs/rules' }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ coverage_status: 'unknown' })));
  vi.stubGlobal('fetch', fetcher);
  const result = await handleToolCall('get_coverage', { repository: 'OCSF' });
  expect(result.isError).toBeUndefined();
  expect(fetcher.mock.calls[1][0]).toContain('repository_id=rr_fixture');
});
it('does not advertise the unavailable standalone Sigma endpoint', () => {
  expect(TOOLS.some(t => t.name === 'convert_sigma')).toBe(false);
});
it('surfaces partial backtests as errors instead of successful zero matches', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ total_matches: 0, sample_events: [], failed_windows: 3 }))));
  expect((await handleToolCall('test_detection', { query: 'class_uid=3002' })).isError).toBe(true);
});

it('includes server OCSF validation errors in validate_detection', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ valid: false, errors: ['Unknown field'], referenced_fields: [] }))));
  const result = await handleToolCall('validate_detection', { content: `---
title: auth_test
severity: high
mode: staging
detection_mode: scheduled
schedule: "*/5 * * * *"
lookback: 15m
---
class_uid=3002 | where unknown_field=1` });
  const validation = JSON.parse(result.content[0].text);
  expect(validation.valid).toBe(false);
  expect(validation.serverValidation.errors).toEqual(['Unknown field']);
});
