/**
 * ReflexWork MCP Server
 *
 * Exposes 5 tools over JSON-RPC 2.0 / stdio:
 *   - analyze_task
 *   - synthesize_document
 *   - query_knowledge_base
 *   - draft_workflow
 *   - attest_and_submit
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { analyzeTask } from "./tools/analyze-task.js";
import { synthesizeDocument } from "./tools/synthesize-document.js";
import { queryKnowledgeBase } from "./tools/query-knowledge-base.js";
import { draftWorkflow } from "./tools/draft-workflow.js";
import { attestAndSubmit } from "./tools/attest-and-submit.js";
import { TOOL_DEFINITIONS } from "./tools/definitions.js";

const server = new Server(
  {
    name: "reflexwork-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: { listChanged: true },
    },
  }
);

// ─── List Tools ───────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

// ─── Call Tool ────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "analyze_task":
        return await analyzeTask(args ?? {});

      case "synthesize_document":
        return await synthesizeDocument(args ?? {});

      case "query_knowledge_base":
        return await queryKnowledgeBase(args ?? {});

      case "draft_workflow":
        return await draftWorkflow(args ?? {});

      case "attest_and_submit":
        return await attestAndSubmit(args ?? {});

      default:
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: `Tool error: ${message}` }],
    };
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until stdin closes
}

main().catch((err) => {
  console.error("MCP server fatal error:", err);
  process.exit(1);
});
