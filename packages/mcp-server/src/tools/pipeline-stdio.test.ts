import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, it } from "vitest";

it("agent stdio call creates a draft against the HTTP fixture without a detection repo", async () => {
  const requests: Array<{
    method: string;
    path: string;
    body: Record<string, unknown>;
  }> = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      method: req.method!,
      path: req.url!,
      body: JSON.parse(body),
    });
    if (req.headers["x-api-key"] !== "fixture-key") {
      res.writeHead(403);
      res.end("{}");
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        id: "lsrc_00000000000000000000000001",
        ...JSON.parse(body),
        deployed: false,
      }),
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture address");
  const cwd = await mkdtemp(join(tmpdir(), "mcppipes-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("packages/mcp-server/dist/index.cjs"), "--workspace-only"],
    cwd,
    env: {
      PATH: process.env.PATH ?? "",
      NANOSIEM_API_URL: `http://127.0.0.1:${address.port}`,
      NANOSIEM_API_KEY: "fixture-key",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "fixture-agent", version: "1" });
  try {
    await client.connect(transport);
    const inventory = await client.listTools();
    expect(
      inventory.tools.some((tool) => tool.name === "create_pipeline"),
    ).toBe(true);
    expect(
      inventory.tools.some((tool) => tool.name === "commit_and_push"),
    ).toBe(false);
    const blocked = await client.callTool({
      name: "commit_and_push",
      arguments: {},
    });
    expect(blocked.isError).toBe(true);
    const result = await client.callTool({
      name: "create_pipeline",
      arguments: {
        name: "Fixture pipeline",
        source_type: "http",
        parser_vrl: ".message = string!(.message)",
      },
    });
    expect(result.isError).not.toBe(true);
    expect(requests).toEqual([
      {
        method: "POST",
        path: "/api/log-sources",
        body: {
          name: "Fixture pipeline",
          source_type: "http",
          parser_vrl: ".message = string!(.message)",
          lifecycle_status: "draft",
        },
      },
    ]);
  } finally {
    await client.close();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(cwd, { recursive: true, force: true });
  }
}, 15000);
