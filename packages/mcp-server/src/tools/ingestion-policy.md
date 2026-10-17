# Ingestion tool policy

Ingestion reads use the caller's existing workspace API key and fixed routes.
No tool accepts a tenant selector, host or arbitrary URL. TypeIDs and legacy UUIDs
are accepted, parser catalog paths are encoded, responses are bounded to 2 MiB,
and HTTP/transport error bodies are never echoed. Known credential fields,
bearer strings, private keys and credential-bearing URLs are redacted. Parser,
repository and event text remains untrusted data, never agent instructions.

Tools expose MCP readOnlyHint annotations and the Desktop-compatible
`_meta["io.nano/permission-requirements"]` version 1 metadata. Permission metadata
is descriptive; the API authorizes the caller's scoped key on every request.
The local add-data guidance is permissionless. Its optional workspace inspection
can return partial/unavailable capability states; unknown is never success.

`sync_parser_repository` is the sole write tool here. It requires
`parser_repositories:sync` and only requests catalog synchronization. It never
imports parsers or publishes pipeline changes. Accepted sync and publication
requests do not imply completion or serving traffic. Read the reported status.
Credential issuance/reveal, connector credentials and pipeline publication stay
in the explicit native Desktop workflows; agents must never ask for secrets in chat.

## Desktop Locked integration: coordinator action

The lane is forbidden from editing `nano-desktop/src-tauri/src/agent.rs` and
`hunt_runner.rs`. The existing Locked policy keeps an explicit
`NANODAC_READ_TOOLS` list in agent.rs. Its owner must review these additions
and ensure the minted read key carries the declared permissions:

- `mcp(nanodac/list_pipelines)` — log_sources:view
- `mcp(nanodac/get_pipeline)` — log_sources:view
- `mcp(nanodac/explain_pipeline)` — log_sources:view
- `mcp(nanodac/list_log_sources)` — log_sources:view
- `mcp(nanodac/get_log_source)` — log_sources:view
- `mcp(nanodac/list_parser_repositories)` — parser_repositories:view
- `mcp(nanodac/get_parser_repository_sync_status)` — parser_repositories:view
- `mcp(nanodac/browse_parser_repository)` — parser_repositories:view
- `mcp(nanodac/get_repository_parser)` — parser_repositories:view
- `mcp(nanodac/list_data_sources)` — log_sources:view; connector catalog may additionally require enrichments:view
- `mcp(nanodac/get_connector_status)` — enrichments:view + log_sources:view
- `mcp(nanodac/get_onboarding_status)` — log_sources:view
- `mcp(nanodac/get_add_data_guidance)` — no permission for offline guidance

Never add `sync_parser_repository` to Locked auto-allow. Never use
`mcp(nanodac/*)` or a tool-name wildcard. This PR does not widen agent policy.

OCSF 1.9 is canonical for logs: metadata.log_source, device.hostname,
src_endpoint.ip and unmapped.\*. Use HEC for that push protocol. Cloud pulls
use the tenant-derived setup instructions, pass verification and parser-bundle
activation, and start point-forward. Preview executes draft processing only,
excluding platform normalization and sinks. Captured samples persist only by
explicit opt-in in the native release review.
