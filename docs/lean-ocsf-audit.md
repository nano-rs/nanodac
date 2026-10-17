# NAN-4014 lean / OCSF 1.9 audit

Source of truth: nanosiem origin/main `d579d099526523ddd4f21ce06921780f6e2e8638` (2026-10-17).
“Works” means the route and shape are present in the shared lean source; it does not claim
live execution of write tools. Tenant permissions and feature availability still apply.
No tenant writes were made. `ingestion.ts` is intentionally owned by the NAN-4013 lane.

## Feature/tool and endpoint matrix

| Tool / feature | API / fields | Before | After | Evidence |
| --- | --- | --- | --- | --- |
| list_detections | GET /api/rules | Works | Retained array contract and local filters | A |
| get_detection | GET /api/rules/{id}, or list by name | Works | Retained TypeID contract | A |
| create_detection | POST /api/rules | API works; legacy query examples | Canonical nPL examples; optional source_slug binding; flat payload | A; payload tests |
| update_detection | PUT /api/rules/{id} | API works; legacy query examples | Canonical nPL examples; flat response and source binding | E; payload tests |
| validate_detection | Local YAML validation | Broken: no tenant query validation; dotted fields warned | Dotted requirements accepted; server validation included; failure is invalid | E; lean fixture tests |
| test_detection | POST /api/rules/test | Broken grouping: flat UDM fields/time; missing lookback | Authored lookback/schedule; nested/flat canonical rows and millisecond time; failed windows are errors | E; grouping/partial-window tests |
| search | POST /api/search on search URL | Route works; missing count/paging semantics | Logs dataset; skip unused companions; preserve bounded count and pagination; offset supported | Q; contract test; live smoke PASS |
| generate_hints | GET /api/rules/{id}; POST /api/melod/detection/hints | Broken placeholder | Starts real metadata-based async job; no claim of alert-based hints | A, H; job fixture test |
| get_hint_job | GET /api/melod/jobs/{job_id} | Absent | Polls job status/result; cache-busted GET | J; job fixture test |
| get_schema | GET /api/schema/fields | Broken static UDM examples, no field catalog | Strict OCSF 1.9.0 catalog plus canonical detection format; reject other profiles | S; schema fixture tests; live 796-field catalog PASS |
| list_repositories | GET /api/rule-repositories | Works with scoped permissions | Retained native content routes; main remains content default | R, C |
| sync_repository | POST /api/rule-repositories/{id}/sync | Works with scoped permissions | Retained native content routes; main remains content default | R, C |
| browse_repository | GET /api/rule-repositories/{id}/rules | Works with scoped permissions | Retained native content routes; main remains content default | R, C |
| import_rule | GET …/rules/preview/{path}; POST …/rules/import/{path} | Works with scoped permissions | Retained native content routes; main remains content default | R, C |
| convert_sigma (removed) | POST /api/sigma/convert | Gen1/dedicated-only: shared adapter explicitly excludes route | Removed tool; import curated native nPL content instead | R, F; removal test |
| get_coverage | GET /api/rule-repositories/coverage | Broken name filter sent as repository_id | Resolves name/slug/ID; preserves unknown coverage | R; coverage fixture test |
| get_mitre_coverage | GET /api/mitre/coverage | Works | Retained ATT&CK catalog and rule coverage; unknown telemetry preserved | M; existing MITRE tests |
| promote_detection | POST /api/rules/{id}/promote | Works | Retained lifecycle transition | A |
| demote_detection | POST /api/rules/{id}/demote | Works | Retained lifecycle transition | A |
| trigger_detection | POST /api/rules/{id}/trigger | Route works; misleading executed text | Reports queued tenant execution; typed near_real_time/scheduled metadata | F |
| validate_query | POST /api/rules/validate | Works; outdated type model | Retained server validation; near_real_time metadata typed; no MV expectation | E |
| create_issue | Local filesystem/git/gh; no nano endpoint | Independent of lake | Retained; no live invocation in this audit | tools/index.ts handlers |
| list_issues | Local filesystem/git/gh; no nano endpoint | Independent of lake | Retained; no live invocation in this audit | tools/index.ts handlers |
| create_branch | Local filesystem/git/gh; no nano endpoint | Independent of lake | Retained; no live invocation in this audit | tools/index.ts handlers |
| write_detection_file | Local filesystem/git/gh; no nano endpoint | Independent of lake | Retained; no live invocation in this audit | tools/index.ts handlers |
| commit_and_push | Local filesystem/git/gh; no nano endpoint | Independent of lake | Retained; no live invocation in this audit | tools/index.ts handlers |
| create_pull_request | Local filesystem/git/gh; no nano endpoint | Independent of lake | Retained; no live invocation in this audit | tools/index.ts handlers |
| get_current_branch | Local filesystem/git/gh; no nano endpoint | Independent of lake | Retained; no live invocation in this audit | tools/index.ts handlers |
| sync_repo | Local filesystem/git/gh; no nano endpoint | Independent of lake | Retained; no live invocation in this audit | tools/index.ts handlers |
| list_pipelines; list_log_sources | GET /api/log-sources | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | I; 20 ingestion tests |
| get_pipeline; get_log_source | GET /api/log-sources/{id}/draft-status | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | I; 20 ingestion tests |
| explain_pipeline | GET …/draft-status, …/pipe-inputs, …/pipe-capabilities | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | I; 20 ingestion tests |
| list_parser_repositories | GET /api/parser-repositories | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | P; 20 ingestion tests |
| get_parser_repository_sync_status | GET /api/parser-repositories/{id}/sync/status | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | P; 20 ingestion tests |
| browse_parser_repository | GET /api/parser-repositories/{id}/parsers | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | P; 20 ingestion tests |
| get_repository_parser | GET /api/parser-repositories/{id}/parsers/by-path/{path} | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | P; 20 ingestion tests |
| list_data_sources | GET /api/pull-sources; /api/marketplace/collectors | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | I; 20 ingestion tests |
| get_connector_status | GET /api/marketplace/collectors/{connector} | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | I; 20 ingestion tests |
| get_onboarding_status | GET /api/source-onboarding | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | I; 20 ingestion tests |
| get_add_data_guidance | Local guidance; optional GET /api/log-sources/ingest-endpoint, /api/pull-sources, /api/marketplace/collectors | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | I; 20 ingestion tests |
| sync_parser_repository | POST /api/parser-repositories/{id}/sync | Works: already OCSF/lean | Retained without editing ingestion.ts; NAN-4013 owns additions | P; 20 ingestion tests |
| get_metric_monitors | GET /api/observability/metric-monitors | Works | Retained no-data/partial statuses | O; existing observability tests |
| get_slos | GET /api/observability/slos | Works | Retained no-data/partial statuses | O; existing observability tests |
| get_synthetics_status | GET /api/observability/synthetics | Works | Retained no-data/partial statuses | O; existing observability tests |
| get_metrics | GET /api/search/metrics/names; POST /api/search/metrics/timeseries | Works | Retained metric_name/time_range/service_name/agg/step_secs contract | T; existing observability tests |
| CLI init / prompts / bundled detections | Local YAML/nPL | Broken UDM examples | Canonical OCSF source/time/entity/process/traffic paths | S; live catalog audit |
| CLI validate / GitHub Action | Local parser/validator | Broken dotted requires.fields warnings | Dotted OCSF requirements accepted; offline syntax validation only | validator; full Vitest suite |
| CLI test | POST /api/rules/test | Broken nested output; --hours rounded to days | Exact time_range, schedule/lookback; canonical rendering; partial-window exit failure | E; core contract/grouping tests |
| CLI sync/diff | GET /api/rules; POST /api/rules; PUT/DELETE /api/rules/{id} | Routes work | Canonical authored queries and optional source binding; provenance preserved | A, E; payload tests |
| CLI repo list/add/sync/browse/import | /api/rule-repositories and paths above | Broken Bearer auth; sync assumed completion | X-API-Key; main branch; native nanosiem format default (--rule-format sigma explicit); HTTP 202 reported accepted | R, C |
| CLI pull / case | Local git/gh | Independent of lake | Retained | CLI handlers |
| Core pause/resume | POST /api/rules/{id}/pause or resume | Works | Retained | A |
| Core format/matches/stats | POST /api/rules/format; GET /api/rules/{id}/matches; GET /api/rules/stats | Works | Retained | E, B |
| Core bulk/import/export | POST /api/rules/bulk-update; POST /api/rules/import; GET /api/rules/export | Works | Retained flat rule payload / JSON array export | E, F |
| Core health | GET /health | Works | Retained | API routes.rs |

## Evidence references

- [A: nanosiem-enterprise/src/handlers/enterprise_shared_detections.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_detections.rs)
- [E: nanosiem-enterprise/src/handlers/enterprise_shared_detection_editor.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_detection_editor.rs)
- [R: nanosiem-enterprise/src/handlers/enterprise_shared_rule_repositories.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_rule_repositories.rs)
- [S: nanosiem-core/src/schema/field_universe.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-core/src/schema/field_universe.rs)
- [Q: nanosiem-core/src/search/types.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-core/src/search/types.rs)
- [H: nanosiem-enterprise/src/handlers/enterprise_shared_melod_wizards.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_melod_wizards.rs)
- [J: nanosiem-enterprise/src/handlers/enterprise_shared_melod.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_melod.rs)
- [M: nanosiem-enterprise/src/handlers/enterprise_shared_mitre.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_mitre.rs)
- [O: nanosiem-enterprise/src/handlers/enterprise_shared_observability.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_observability.rs)
- [T: nanosiem-search/src/handlers/otel.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-search/src/handlers/otel.rs)
- [I: nanosiem-enterprise/src/handlers/enterprise_shared_sources.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_sources.rs)
- [P: nanosiem-enterprise/src/handlers/enterprise_shared_sources_parsers.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_sources_parsers.rs)
- [F: nanosiem-enterprise/src/handlers/enterprise_shared_rules_alerts_remainder.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_rules_alerts_remainder.rs)
- [C: nanosiem-core/src/schema/mod.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-core/src/schema/mod.rs)
- [B: nanosiem-enterprise/src/handlers/enterprise_shared_detection_dashboard.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_detection_dashboard.rs)

Additional ingestion route evidence:

- [enterprise_shared_pipe.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_pipe.rs)
- [enterprise_shared_pull_sources.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/enterprise_shared_pull_sources.rs)
- [hosted_collectors.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/hosted_collectors.rs)
- [source_onboarding.rs](https://github.com/nano-rs/nanosiem/blob/d579d099526523ddd4f21ce06921780f6e2e8638/nanosiem-enterprise/src/handlers/source_onboarding.rs)

## Validation

- Full repository Vitest suite: 41 tests passing (7 files).
- Core, CLI and MCP builds and TypeScript checks pass; all 6 bundled detection files pass CLI validation.
- Live read-only smoke: strict schema and lean search PASS against the documented lean test tenant,
  using only the search-only key file and X-API-Key through the configured conduit.
- Live field catalog: 796 canonical fields. Examples checked against these names; no event rows or keys logged.
- Reproduce: build core, then `NODE_USE_ENV_PROXY=1 node scripts/smoke-lean.mjs`.
- The all-package type check was attempted; GitHub Action dependency installation is blocked by registry fetch failures.
  Its source was not changed. The full test suite still ran from the repository root.
