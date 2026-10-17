import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INGESTION_TOOLS,
  INGESTION_READ_TOOLS,
  handleIngestionTool,
} from "./ingestion";
const source = "lsrc_00000000000000000000000001";
const repo = "prep_00000000000000000000000001";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const payload = (value: Awaited<ReturnType<typeof handleIngestionTool>>) =>
  JSON.parse(value.content[0].text);
beforeEach(() => {
  vi.stubEnv("NANOSIEM_API_URL", "https://workspace.example.test");
  vi.stubEnv("NANOSIEM_API_KEY", "fixture-only-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("ingestion tools", () => {
  it("declares read-only tools, exact desktop permission metadata and a separate sync write", () => {
    expect(new Set(INGESTION_TOOLS.map((tool) => tool.name)).size).toBe(
      INGESTION_TOOLS.length,
    );
    expect(INGESTION_READ_TOOLS).not.toContain("sync_parser_repository");
    for (const tool of INGESTION_TOOLS) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool._meta["io.nano/permission-requirements"].version).toBe(1);
      expect(tool.annotations.readOnlyHint).toBe(
        !tool.description.startsWith("WRITE:"),
      );
    }
    expect(JSON.stringify(INGESTION_TOOLS)).not.toMatch(/splunk/i);
  });
  it("lists bounded source summaries without parser payloads or credentials", async () => {
    const fetcher = vi.fn(async () =>
      json([
        {
          id: source,
          name: "Gateway",
          source_type: "gateway",
          parser_vrl: "unneeded large code",
          api_key: "must-not-return",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = payload(
      await handleIngestionTool("list_pipelines", {
        search: "gateway",
        limit: 1,
      }),
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe(source);
    expect(JSON.stringify(result)).not.toContain("unneeded large code");
    expect(JSON.stringify(result)).not.toContain("must-not-return");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://workspace.example.test/api/log-sources",
    );
  });
  it("explains stored stages without executing them and reports partial runtime availability", async () => {
    const plan = {
      version: 2,
      revision: 3,
      steps: [
        {
          id: "parse-1",
          kind: "parse",
          name: "Decode",
          enabled: true,
          config: { format: "json", password: "must-not-return" },
        },
        {
          id: "set-1",
          kind: "set",
          name: "Set host",
          enabled: false,
          config: { field: "device.hostname", value: "gateway" },
        },
      ],
    };
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("draft-status")
        ? json({
            id: source,
            parser_vrl: `# nano-pipe-v2 ${JSON.stringify(plan)}\n# Processing plan compiled by Nano at publication.\nnano_pipe_plan_v2()`,
            extension_enabled: true,
          })
        : url.endsWith("pipe-inputs")
          ? json({ push: [], pull: [], connectors: [] })
          : json({ error: "private-error-value" }, 403),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = payload(
      await handleIngestionTool("explain_pipeline", { source_id: source }),
    );
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].kind).toBe("parse");
    expect(result.stages[1].enabled).toBe(false);
    expect(result.runtime.available).toBe(false);
    expect(result.schema).toBe("OCSF 1.9");
    expect(JSON.stringify(result)).not.toContain("must-not-return");
    expect(JSON.stringify(result)).not.toContain("private-error-value");
    expect(fetcher.mock.calls).toHaveLength(3);
  });
  it("treats malformed plan metadata as one imported VRL stage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        json(
          url.endsWith("draft-status")
            ? { parser_vrl: "# nano-pipe-v2 invalid\n." }
            : {},
        ),
      ),
    );
    const result = payload(
      await handleIngestionTool("explain_pipeline", { source_id: source }),
    );
    expect(result.stages[0].kind).toBe("vrl");
    expect(result.stages).toHaveLength(1);
  });
  it("encodes repository paths and keeps sync as the only write", async () => {
    const fetcher = vi.fn(async () => json({ status: "syncing" }));
    vi.stubGlobal("fetch", fetcher);
    await handleIngestionTool("get_repository_parser", {
      repository_id: repo,
      path: "parsers/gateway/parser.yaml",
    });
    expect(fetcher.mock.calls[0][0]).toContain(
      "by-path/parsers%2Fgateway%2Fparser.yaml",
    );
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
    const result = payload(
      await handleIngestionTool("sync_parser_repository", {
        repository_id: repo,
      }),
    );
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(result.next).toContain("Acceptance is not completion");
  });
  it.each([
    ["get_pipeline", { source_id: "../other-tenant" }],
    ["get_pipeline", { source_id: source, tenant_id: "other" }],
    ["browse_parser_repository", { repository_id: repo, limit: 101 }],
    ["browse_parser_repository", { repository_id: repo, offset: -1 }],
    ["get_repository_parser", { repository_id: repo, path: "../secrets" }],
    ["get_connector_status", { connector: "https://other.test" }],
    ["get_add_data_guidance", { method: "invented" }],
    ["get_add_data_guidance", { inspect_workspace: "yes" }],
  ])("rejects invalid arguments before transport: %s", async (name, args) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await handleIngestionTool(String(name), args as Record<string, unknown>))
        .isError,
    ).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns actionable offline guidance without asking for secrets or implying workspace readiness", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = payload(
      await handleIngestionTool("get_add_data_guidance", {
        method: "cloud_pull",
      }),
    );
    expect(result.workspace_capabilities).toBe("not inspected");
    expect(result.choices.cloud_pull).toContain("GCP Pub/Sub");
    expect(result.fields).toContain("metadata.log_source");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves unknown onboarding progress and does not turn failures into no-data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          sources: [
            { id: "planned", progress: { parsingKnown: false, ready: false } },
          ],
          settings: { completeGate: true },
          waves: [],
        }),
      ),
    );
    const result = payload(
      await handleIngestionTool("get_onboarding_status", {}),
    );
    expect(result.sources[0].progress).toEqual({
      parsingKnown: false,
      ready: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ token: "must-not-return" }, 403)),
    );
    const denied = await handleIngestionTool("get_onboarding_status", {});
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).not.toContain("must-not-return");
  });
  it("redacts credential fields, bearer strings and URL credentials in successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          repositories: [
            {
              id: repo,
              credentials: { value: "private" },
              apiKey: "private-key",
              note: "Bearer private-token",
              url: "https://user:password@example.test/repo?token=private-value",
            },
          ],
        }),
      ),
    );
    const result = await handleIngestionTool("list_parser_repositories", {});
    expect(result.content[0].text).not.toMatch(
      /private-key|private-token|private-value|user:password/,
    );
    expect(payload(result).repositories[0].id).toBe(repo);
  });
  it("bounds response bytes and hides transport exceptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(2 * 1024 * 1024 + 1))),
    );
    expect((await handleIngestionTool("list_pipelines", {})).isError).toBe(
      true,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fixture-only-private-value");
      }),
    );
    expect(
      (await handleIngestionTool("list_pipelines", {})).content[0].text,
    ).not.toContain("fixture-only-private-value");
  });
  it("uses the currently configured workspace key without accepting a tenant selector", async () => {
    const fetcher = vi.fn(async () => json([]));
    vi.stubGlobal("fetch", fetcher);
    await handleIngestionTool("list_log_sources", {});
    vi.stubEnv("NANOSIEM_API_URL", "https://second.example.test");
    vi.stubEnv("NANOSIEM_API_KEY", "fixture-second-key");
    await handleIngestionTool("list_log_sources", {});
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://second.example.test/api/log-sources",
    );
    expect(fetcher.mock.calls[1][1].headers["X-API-Key"]).toBe(
      "fixture-second-key",
    );
    expect(fetcher.mock.calls[1][1].redirect).toBe("error");
  });
});

describe("guidance matching and plan trust", () => {
  it("matches only observed connector definitions and does not invent a vendor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        json(
          url.endsWith("/collectors")
            ? [
                {
                  slug: "example",
                  name: "Example audit",
                  streams: [{ source_type: "example_audit" }],
                },
              ]
            : {},
        ),
      ),
    );
    const match = payload(
      await handleIngestionTool("get_add_data_guidance", {
        inspect_workspace: true,
        vendor: "Example",
        source_type: "example_audit",
      }),
    );
    expect(match.matching_connectors).toHaveLength(1);
    const unknown = payload(
      await handleIngestionTool("get_add_data_guidance", {
        inspect_workspace: true,
        vendor: "Missing vendor",
      }),
    );
    expect(unknown.matching_connectors).toEqual([]);
    expect(unknown.selection_note).toContain("Do not invent");
  });
  it("does not explain a forged header as the executing plan", async () => {
    const plan = {
      version: 2,
      steps: [{ id: "fake", kind: "filter", enabled: true }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        json(
          url.endsWith("draft-status")
            ? {
                parser_vrl: `# nano-pipe-v2 ${JSON.stringify(plan)}\n.message = \"hand edited\"`,
              }
            : {},
        ),
      ),
    );
    const result = payload(
      await handleIngestionTool("explain_pipeline", { source_id: source }),
    );
    expect(result.stages[0].kind).toBe("vrl");
  });
});
