/**
 * nanodac MCP Server
 *
 * Provides MCP tools and prompts for AI-assisted detection management
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Load environment variables from .env file
 */
function loadEnvFile(startDir: string): void {
  const envFiles = ['.env', '.env.local'];
  let currentDir = startDir;

  while (currentDir !== '/') {
    for (const envFile of envFiles) {
      const envPath = join(currentDir, envFile);
      if (existsSync(envPath)) {
        try {
          const content = readFileSync(envPath, 'utf-8');
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
              const key = trimmed.slice(0, eqIndex).trim();
              let value = trimmed.slice(eqIndex + 1).trim();

              if ((value.startsWith('"') && value.endsWith('"')) ||
                  (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
              }

              if (!process.env[key]) {
                process.env[key] = value;
              }
            }
          }
        } catch {
          // Ignore errors reading .env file
        }
        return;
      }
    }
    currentDir = dirname(currentDir);
  }
}

// Load .env file from cwd
loadEnvFile(process.cwd());
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, handleToolCall } from './tools/index.js';
import { PROMPTS, handlePrompt } from './prompts/index.js';

// Create server
const server = new Server(
  {
    name: 'nanodac-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, (args || {}) as Record<string, unknown>);
});

// Register prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS,
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handlePrompt(name, (args || {}) as Record<string, string | undefined>);
});

// Start server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP communication
  console.error('nanodac MCP server started');
  console.error('Required environment variables:');
  console.error('  NANOSIEM_API_URL - NanoSIEM API URL');
  console.error('  NANOSIEM_API_KEY - API key for authentication');
  console.error('  NANOSIEM_SEARCH_URL - Search service URL (optional)');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
