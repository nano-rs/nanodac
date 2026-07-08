import { describe, it, expect } from 'vitest';
import { parseDetectionFile } from '../parser/index.js';
import { detectionToApiPayload } from './index.js';

const FILE = `---
title: Test Rule
severity: high
mode: alerting
detection_mode: scheduled
---
source_type=windows | stats count by user
`;

function sampleDetection() {
  const result = parseDetectionFile(FILE, 'detections/test.yaml');
  if (!result.success) throw new Error('fixture failed to parse');
  return result.detection!;
}

describe('detectionToApiPayload — DaC provenance (NAN-1764)', () => {
  it('omits provenance when no opts are passed (MCP/ad-hoc path)', () => {
    const payload = detectionToApiPayload(sampleDetection());
    expect('source_path' in payload).toBe(false);
    expect('source_repo_url' in payload).toBe(false);
  });

  it('stamps source_path (and repo url) when provided (sync path)', () => {
    const payload = detectionToApiPayload(sampleDetection(), {
      sourcePath: 'detections/win/test.yaml',
      sourceRepoUrl: 'https://github.com/acme/detections',
    });
    expect(payload.source_path).toBe('detections/win/test.yaml');
    expect(payload.source_repo_url).toBe('https://github.com/acme/detections');
  });

  it('omits source_repo_url when only sourcePath is provided', () => {
    const payload = detectionToApiPayload(sampleDetection(), {
      sourcePath: 'detections/test.yaml',
    });
    expect(payload.source_path).toBe('detections/test.yaml');
    expect('source_repo_url' in payload).toBe(false);
  });
});
