// Read-only live smoke. Never logs keys, event rows, server error bodies or URLs.
// Build @nano-rs/dac-core first.
import { readFile } from 'node:fs/promises';
import { NanosiemClient } from '../packages/core/dist/index.js';
let apiKey = process.env.NANOSIEM_API_KEY;
if (!apiKey && process.env.NANODAC_SMOKE_KEY_FILE) {
  const raw = await readFile(process.env.NANODAC_SMOKE_KEY_FILE, 'utf8');
  try {
    apiKey = JSON.parse(raw).secret;
  } catch {
    apiKey = raw.trim();
  }
}
if (!apiKey) throw new Error('Set NANOSIEM_API_KEY or NANODAC_SMOKE_KEY_FILE');
const client = new NanosiemClient({ apiUrl: process.env.NANOSIEM_API_URL || 'http://localhost:3000', searchUrl: process.env.NANOSIEM_SEARCH_URL, apiKey, timeout: 45000 });
let failed = false;
const schema = await client.getSchema();
console.log(`schema: ${schema.success ? 'PASS' : schema.error?.code || 'FAIL'}`);
if (schema.success) {
  const names = new Set(schema.data.fields.map(f => f.name));
  for (const name of ['time', 'metadata.log_source', 'src_endpoint.ip', 'user.name', 'process.cmd_line']) {
    if (!names.has(name)) { console.log(`missing canonical field: ${name}`); failed = true; }
  }
} else failed = true;
const end = new Date();
const search = await client.search('* | head 1', { start: new Date(end.getTime() - 300000).toISOString(), end: end.toISOString() }, { limit: 1 });
const valid = search.success && Array.isArray(search.data.results) && typeof search.data.total_count === 'number' && typeof search.data.execution_time_ms === 'number' && Array.isArray(search.data.fields);
console.log(`search: ${valid ? 'PASS' : search.error?.code || 'INVALID_SHAPE'}`);
if (!valid) failed = true;
process.exitCode = failed ? 1 : 0;
