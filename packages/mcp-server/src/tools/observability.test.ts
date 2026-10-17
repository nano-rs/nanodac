import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleObservabilityTool } from './observability';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('observability reads', () => {
  it('uses fixed read routes and retains no-data/telemetry metadata', async () => {
    vi.stubEnv('NANOSIEM_API_URL', 'https://fixture.invalid');
    vi.stubEnv('NANOSIEM_API_KEY', 'fixture-only');
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          telemetry: { available: false },
          status: 'no_data',
        }),
      });
    vi.stubGlobal('fetch', fetcher);
    for (const [name, path] of [
      ['get_metric_monitors', 'metric-monitors'],
      ['get_slos', 'slos'],
      ['get_synthetics_status', 'synthetics'],
    ]) {
      const result = await handleObservabilityTool(name, {});
      expect(JSON.parse(result.content[0].text).status).toBe('no_data');
      expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
        `https://fixture.invalid/api/observability/${path}`,
      );
      expect(fetcher.mock.calls.at(-1)?.[1].method).toBe('GET');
    }
  });
  it('queries metrics on search and validates the time range', async () => {
    vi.stubEnv('NANOSIEM_API_URL', 'https://fixture.invalid');
    vi.stubEnv('NANOSIEM_SEARCH_URL', 'https://search.invalid');
    vi.stubEnv('NANOSIEM_API_KEY', 'fixture-only');
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ series: [] }) });
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await handleObservabilityTool('get_metrics', { metric_name: 'cpu' }))
        .isError,
    ).toBe(true);
    await handleObservabilityTool('get_metrics', {
      metric_name: 'cpu',
      start: '2026-10-16T00:00:00Z',
      end: '2026-10-16T01:00:00Z',
    });
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://search.invalid/api/search/metrics/timeseries',
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body).metric_name).toBe('cpu');
  });
  it('redacts remote and transport errors', async () => {
    vi.stubEnv('NANOSIEM_API_URL', 'https://fixture.invalid');
    vi.stubEnv('NANOSIEM_API_KEY', 'fixture-only');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 403,
          text: async () => 'sensitive',
        }),
    );
    expect(
      (await handleObservabilityTool('get_slos', {})).content[0].text,
    ).toBe('Observability read unavailable (HTTP 403)');
  });
});
