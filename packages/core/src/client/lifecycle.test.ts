import { afterEach, describe, expect, it, vi } from 'vitest';
import { NanosiemClient } from './index.js';

const client = () =>
  new NanosiemClient({
    apiUrl: 'https://api.invalid/',
    apiKey: 'fixture-key',
  });

afterEach(() => vi.unstubAllGlobals());

describe('guarded rule lifecycle', () => {
  it.each([
    ['promoteDetection', 'promote', 'staging', 'live'],
    ['promoteDetection', 'promote', 'live', 'alerting'],
    ['demoteDetection', 'demote', 'alerting', 'live'],
    ['demoteDetection', 'demote', 'live', 'staging'],
  ] as const)(
    'reads current mode before %s and sends expected_mode',
    async (method, action, from, to) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'rule_one', mode: from })),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'rule_one', mode: to })),
        );
      vi.stubGlobal('fetch', fetcher);

      const result = await client()[method]('rule_one');

      expect(result.success).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[0][0]).toBe(
        'https://api.invalid/api/rules/rule_one',
      );
      expect(fetcher.mock.calls[0][1].method).toBe('GET');
      expect(fetcher.mock.calls[1][0]).toBe(
        `https://api.invalid/api/rules/rule_one/${action}`,
      );
      expect(fetcher.mock.calls[1][1].method).toBe('POST');
      expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
        expected_mode: from,
      });
    },
  );

  it('does not transition when the current mode cannot be read', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'missing' }), {
        status: 404,
        statusText: 'Not Found',
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const result = await client().promoteDetection('missing');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('HTTP_404');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
