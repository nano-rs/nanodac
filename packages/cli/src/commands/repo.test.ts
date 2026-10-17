import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { repoAddCommand, repoSyncCommand } from './repo.js';
vi.mock('../config.js', () => ({ requireConfig: async () => ({ apiUrl: 'https://api.invalid' }), getApiKey: () => 'fixture-key' }));
beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('uses X-API-Key and defaults new repositories to main native nPL content', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'rules', id: 'rr_fixture', slug: 'nano-rs/rules' })));
  vi.stubGlobal('fetch', fetcher);
  await repoAddCommand({ name: 'rules', url: 'https://github.com/nano-rs/rules' });
  const [, init] = fetcher.mock.calls[0];
  expect(init.headers['X-API-Key']).toBe('fixture-key');
  expect(init.headers.Authorization).toBeUndefined();
  expect(JSON.parse(init.body)).toMatchObject({ branch: 'main', rule_format: 'nanosiem' });
});
it('reports a 202 sync as accepted without fabricated completion counts', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ repositories: [{ id: 'rr_fixture', name: 'rules', slug: 'nano-rs/rules', url: 'https://github.com/nano-rs/rules' }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'syncing' }), { status: 202 }));
  vi.stubGlobal('fetch', fetcher);
  await repoSyncCommand({ name: 'rules' });
  const output = vi.mocked(console.log).mock.calls.flat().join(' ');
  expect(output).toContain('accepted');
  expect(output).not.toContain('Sync complete');
  expect(output).not.toContain('undefined');
});
