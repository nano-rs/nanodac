/** Read-only observability tools. Every route is fixed here, never supplied by a caller. */
const emptySchema = {
  type: 'object' as const,
  properties: {},
  additionalProperties: false,
};
export const OBSERVABILITY_TOOLS = [
  {
    name: 'get_metric_monitors',
    description:
      'Read saved metric monitors, recent evaluations and telemetry availability; no-data is not healthy.',
    inputSchema: emptySchema,
  },
  {
    name: 'get_slos',
    description:
      'Read SLO status, attainment and error budgets, including no_data and partial windows.',
    inputSchema: emptySchema,
  },
  {
    name: 'get_synthetics_status',
    description:
      'Read synthetic definitions, uptime and run status. Hosted probes may be disabled; absent runs are not outages.',
    inputSchema: emptySchema,
  },
  {
    name: 'get_metrics',
    description:
      'Read metric names or a metric time series from the search service.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        metric_name: {
          type: 'string',
          description: 'Omit to list available metric names',
        },
        start: {
          type: 'string',
          description: 'RFC3339 start, required with metric_name',
        },
        end: {
          type: 'string',
          description: 'RFC3339 end, required with metric_name',
        },
        service: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
];
const paths: Record<string, string> = {
  get_metric_monitors: '/api/observability/metric-monitors',
  get_slos: '/api/observability/slos',
  get_synthetics_status: '/api/observability/synthetics',
};
export async function handleObservabilityTool(
  name: string,
  args: Record<string, unknown>,
) {
  const fail = (message: string) => ({
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  });
  const base = process.env.NANOSIEM_API_URL;
  const key = process.env.NANOSIEM_API_KEY;
  if (!base || !key)
    return fail('NANOSIEM_API_URL and NANOSIEM_API_KEY must be configured');
  let path = paths[name];
  let method = 'GET';
  let body: string | undefined;
  let origin = base;
  if (name === 'get_metrics') {
    origin = process.env.NANOSIEM_SEARCH_URL || base;
    if (
      args.metric_name !== undefined &&
      (typeof args.metric_name !== 'string' || !args.metric_name.trim())
    )
      return fail('metric_name must be a nonempty string');
    if (args.service !== undefined && typeof args.service !== 'string')
      return fail('service must be a string');
    if (args.metric_name) {
      if (
        typeof args.start !== 'string' ||
        typeof args.end !== 'string' ||
        !Number.isFinite(Date.parse(args.start)) ||
        !Number.isFinite(Date.parse(args.end)) ||
        Date.parse(args.end) <= Date.parse(args.start)
      )
        return fail('A valid start/end range is required');
      path = '/api/search/metrics/timeseries';
      method = 'POST';
      body = JSON.stringify({
        metric_name: args.metric_name,
        time_range: { start: args.start, end: args.end },
        service_name: args.service,
        agg: 'avg',
        step_secs: 60,
      });
    } else
      path = `/api/search/metrics/names${args.service ? `?service=${encodeURIComponent(args.service as string)}` : ''}`;
  }
  if (!path) return fail('Unknown observability tool');
  try {
    const response = await fetch(`${origin.replace(/\/$/, '')}${path}`, {
      method,
      body,
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      return fail(`Observability read unavailable (HTTP ${response.status})`);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(await response.json(), null, 2),
        },
      ],
    };
  } catch {
    return fail('Observability read failed');
  }
}
