// Read-only live smoke. Never logs keys, event rows, server error bodies or URLs.
// Build @nanodac/core first. NODE_USE_ENV_PROXY=1 honors a configured conduit proxy.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { NanosiemClient } from '../packages/core/dist/index.js';
const apiKey = JSON.parse(await readFile(process.env.NANODAC_SMOKE_KEY_FILE || `${homedir()}/.config/nano-test-tenant/lean-api-key-b12e5ee2.json`, 'utf8')).secret;
if (!apiKey) throw new Error('Search-only key file has no secret field');
const client = new NanosiemClient({ apiUrl: process.env.NANOSIEM_API_URL || 'https://us.nano.rs', searchUrl: process.env.NANOSIEM_SEARCH_URL, apiKey, timeout: 45000 });
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
const valid = search.success && Array.isArray(search.data.results) && typeof search.data.total_count_exact === 'boolean' && typeof search.data.has_more === 'boolean';
console.log(`search: ${valid ? 'PASS' : search.error?.code || 'INVALID_SHAPE'}`);
if (!valid) failed = true;
process.exitCode = failed ? 1 : 0;
