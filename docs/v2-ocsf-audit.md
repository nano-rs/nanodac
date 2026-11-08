# nano v2 API and OCSF audit

Audited against `nano-rs/nanosiem` `origin/clickhouse/dev` at
`df20f16e964df40245c18aa2d8cfac02ac721988` on 2026-11-08.

## Contract decisions

- nano v2 stores logs in the ClickHouse OCSF path and queries them through the
  `logs` dataset.
- `GET /api/schema/fields` returns only `schema` and `fields`. It does not return
  `schema_version` or `strict_canonical_fields`.
- The v2 OCSF registry is version-agnostic. It currently embeds an OCSF 1.9.0
  contract, while each stored event retains its own `metadata.version`. nanodac
  therefore requires `schema: "ocsf"` but does not invent a tenant-wide version.
- First-party parser and rule content follows `main`; the UDM archive remains on
  `legacy/clickhouse`.
- API keys use `X-API-Key`. `NANOSIEM_SEARCH_URL` remains optional for deployments
  that expose search separately.
- The v2 search response has `results`, `total_count`, `execution_time_ms`, and
  `fields`. Lake-only `total_count_exact`, `has_more`, and `next_offset` fields
  are not part of the contract.

## Route parity

| nanodac surface | nano v2 route or local surface | Status |
| --- | --- | --- |
| Rule list/create | `GET/POST /api/rules` | Ported |
| Rule get/update/delete | `GET/PUT/DELETE /api/rules/{id}` | Ported |
| Pause/resume/promote/demote | `POST /api/rules/{id}/{action}` with `expected_mode` | Ported; #16/#17 guards retained |
| Test saved/ad-hoc rule | `POST /api/rules/{id}/test`, `POST /api/rules/test` | Ported |
| Search | `POST /api/search` on the API or configured search URL | Ported to v2 response shape |
| Field catalog | `GET /api/schema/fields` | Ported; lake-only version/strict checks removed |
| Enterprise hint job | `POST /api/melod/detection/hints`, `GET /api/melod/jobs/{job_id}` | Ported; enterprise-only |
| Health | `GET /health` | Ported |
| Manual trigger | `POST /api/rules/{id}/trigger` | Ported |
| Validate/format | `POST /api/rules/validate`, `POST /api/rules/format` | Ported |
| Matches/stats | `GET /api/rules/{id}/matches`, `GET /api/rules/stats` | Ported |
| Bulk/import/export | `POST /api/rules/bulk-update`, `POST /api/rules/import`, `GET /api/rules/export` | Ported |
| Rule repository list/create | `GET/POST /api/rule-repositories` | Ported |
| Rule repository sync/browse/preview/import/coverage | `/api/rule-repositories/...` | Ported |
| MITRE coverage | `GET /api/mitre/coverage` | Ported |
| Observability reads | `GET /api/observability/{metric-monitors,slos,synthetics}` | Ported |
| Metrics | `GET /api/search/metrics/names`, `POST /api/search/metrics/timeseries` | Ported |
| Pipeline list/create/update | `GET/POST /api/log-sources`, `PUT /api/log-sources/{id}` | Ported |
| Pipeline draft/capabilities | `GET /api/log-sources/{id}/draft-status`, `GET .../pipe-capabilities` | Ported |
| Pipeline preview/validate/publish/revert | v2 `pipe-preview`, `validate-vrl`, `publish`, and version `revert` routes | Ported |
| Pipeline versions/deployments | `GET /api/log-sources/{id}/versions`, `GET .../deployments` | Ported; lake rollout routes replaced |
| Parser repository reads/sync | `/api/parser-repositories/...` | Ported |
| Collector catalog/status | `GET /api/marketplace/catalog?category=collector`, `GET .../catalog/{slug}` | Ported; hosted-collector routes replaced |
| Source readiness | `GET /api/log-sources/connect-status`, `GET .../health-series` | Ported; lake source-onboarding route replaced |
| Add-data guidance inspection | v2 ingest endpoint plus collector catalog | Ported; lake pull-source route removed |
| Git/issue/file authoring tools | Local filesystem, git, and `gh` | Retained; independent of storage engine |
| Standalone Sigma conversion | No v2 endpoint | Intentionally dropped by #14; curated nPL import remains |

## Lake routes removed from runtime use

| Removed route | v2 replacement |
| --- | --- |
| `/api/log-sources/{id}/rollouts` and `/api/log-sources/rollouts` | Per-source `/versions` and `/deployments` |
| `/api/log-sources/{id}/pipe-inputs` | `/pipe-capabilities`; route identities remain in saved v2 steps |
| `/api/pull-sources` | Collector entries in `/api/marketplace/catalog` |
| `/api/marketplace/collectors` | `/api/marketplace/catalog?category=collector` |
| `/api/marketplace/collectors/{slug}` | `/api/marketplace/catalog/{slug}` |
| `/api/source-onboarding` | `/api/log-sources/connect-status` plus `/health-series` |

No route gaps remain in the nanodac tool surface.
