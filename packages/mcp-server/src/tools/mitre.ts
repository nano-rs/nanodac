/** Read-only ATT&CK coverage, separate from repository deployability coverage. */
export const MITRE_TOOLS = [{
  name: 'get_mitre_coverage',
  annotations: { readOnlyHint: true },
  _meta: { 'io.nano/permission-requirements': { version: 1, alternatives: [{ allOf: ['mitre:view', 'detections:view'] }] }, 'io.nano/access-tier': 'read' },
  description: 'Read ATT&CK coverage and technique gaps from the connected workspace. Parents and sub-techniques are independent; only live and alerting rules count as active coverage.',
  inputSchema: { type: 'object' as const, properties: {
    technique_id: { type: 'string', description: 'Optional ATT&CK ID such as T1059.001' },
    gaps_only: { type: 'boolean', description: 'Return only techniques without live or alerting rules' },
  }, additionalProperties: false },
}];

export async function handleMitreTool(args: Record<string, unknown>) {
  const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });
  if (args.technique_id !== undefined && (typeof args.technique_id !== 'string' || !/^T\d{4}(?:\.\d{3})?$/.test(args.technique_id))) return fail('Invalid ATT&CK technique ID');
  if (args.gaps_only !== undefined && typeof args.gaps_only !== 'boolean') return fail('gaps_only must be a boolean');
  const url = process.env.NANOSIEM_API_URL;
  const key = process.env.NANOSIEM_API_KEY;
  if (!url || !key) return fail('NANOSIEM_API_URL and NANOSIEM_API_KEY must be configured');
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/mitre/coverage`, { headers: { 'X-API-Key': key }, signal: AbortSignal.timeout(30000) });
    // Do not echo response bodies or thrown transport errors: either can contain credentials.
    if (!response.ok) return fail(`MITRE coverage unavailable (HTTP ${response.status})`);
    const data = await response.json() as { techniques: Array<{ technique_id: string; rules?: Array<{ mode: string }>; data_sources?: Array<{ readiness?: string; connected?: boolean }> }>; summary: unknown; tactics: unknown };
    const techniques = data.techniques.filter((t) => (!args.technique_id || t.technique_id === args.technique_id) && (!args.gaps_only || !(t.rules ?? []).some((r) => ['live', 'alerting'].includes(r.mode.toLowerCase()))));
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ...data, techniques, selection_count: techniques.length, summary_scope: 'whole_catalog' }, null, 2) }] };
  } catch { return fail('MITRE coverage request failed'); }
}
