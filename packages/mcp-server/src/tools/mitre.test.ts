import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleMitreTool } from './mitre';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('MITRE read tool', () => {
  it('filters independent technique gaps without counting staging', async () => {
    vi.stubEnv('NANOSIEM_API_URL', 'https://fixture.invalid'); vi.stubEnv('NANOSIEM_API_KEY', 'fixture-only');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ techniques: [{ technique_id: 'T1000', rules: [{ mode: 'alerting' }] }, { technique_id: 'T1000.001', rules: [{ mode: 'staging' }] }], summary: {} }) });
    vi.stubGlobal('fetch', fetcher);
    const result = await handleMitreTool({ gaps_only: true });
    expect(JSON.parse(result.content[0].text).techniques.map((t: { technique_id: string }) => t.technique_id)).toEqual(['T1000.001']);
    expect(fetcher.mock.calls[0][0]).toBe('https://fixture.invalid/api/mitre/coverage');
  });
  it('rejects malformed IDs and hides remote errors', async () => {
    expect((await handleMitreTool({ technique_id: '../bad' })).isError).toBe(true);
    vi.stubEnv('NANOSIEM_API_URL', 'https://fixture.invalid'); vi.stubEnv('NANOSIEM_API_KEY', 'fixture-only');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sensitive fixture body')));
    expect((await handleMitreTool({})).content[0].text).not.toContain('sensitive');
  });
});
