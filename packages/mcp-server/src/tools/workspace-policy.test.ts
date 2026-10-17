import { expect, it } from 'vitest';
import { WORKSPACE_TOOLS } from './index';
it('declares exact read scope metadata for the audited MITRE and observability surfaces', () => {
  const expected = { get_mitre_coverage: ['mitre:view', 'detections:view'], get_metric_monitors: ['search:execute'], get_slos: ['search:execute'], get_synthetics_status: ['search:view'], get_metrics: ['search:execute'] };
  for (const [name, scopes] of Object.entries(expected)) {
    const tool = WORKSPACE_TOOLS.find(tool => tool.name === name)!;
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool._meta['io.nano/permission-requirements'].alternatives).toEqual([{ allOf: scopes }]);
  }
  expect(WORKSPACE_TOOLS.some(tool => tool.name === 'commit_and_push')).toBe(false);
});
