/**
 * MCP Tool Definitions Registry
 * All tool schemas registered with the MCP server.
 */

export const TOOL_DEFINITIONS = [
  {
    name: "analyze_task",
    description:
      "Analyze a complex task specification and return structured metadata: complexity score, suggested workflow steps, required capabilities, and risk flags.",
    inputSchema: {
      type: "object",
      required: ["task_id", "raw_input", "context_tags"],
      properties: {
        task_id: { type: "string", format: "uuid" },
        raw_input: { type: "string", maxLength: 8192 },
        context_tags: { type: "array", items: { type: "string" }, maxItems: 32 },
        token_budget: { type: "integer", minimum: 256, maximum: 8192, default: 2048 },
        workflow_id: { type: "string", format: "uuid" },
      },
    },
  },

  {
    name: "synthesize_document",
    description:
      "Generate a structured document (report, spec, summary) from provided source materials.",
    inputSchema: {
      type: "object",
      required: ["task_id", "document_type", "source_materials"],
      properties: {
        task_id: { type: "string", format: "uuid" },
        document_type: {
          type: "string",
          enum: [
            "compliance_report",
            "workflow_spec",
            "executive_summary",
            "technical_design",
            "audit_trail_summary",
          ],
        },
        source_materials: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: {
            type: "object",
            required: ["content"],
            properties: {
              label: { type: "string" },
              content: { type: "string", maxLength: 4096 },
              content_type: { type: "string", enum: ["text", "json", "markdown", "csv"] },
            },
          },
        },
        output_language: { type: "string", default: "en" },
        token_budget: { type: "integer", minimum: 512, maximum: 8192, default: 4096 },
        style_hints: { type: "array", items: { type: "string" } },
      },
    },
  },

  {
    name: "query_knowledge_base",
    description:
      "Perform semantic search over the organization's indexed knowledge base.",
    inputSchema: {
      type: "object",
      required: ["task_id", "query"],
      properties: {
        task_id: { type: "string", format: "uuid" },
        query: { type: "string", maxLength: 1024 },
        top_k: { type: "integer", minimum: 1, maximum: 20, default: 5 },
        min_relevance_score: { type: "number", minimum: 0.0, maximum: 1.0, default: 0.7 },
        filters: {
          type: "object",
          properties: {
            document_types: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },

  {
    name: "draft_workflow",
    description:
      "Convert a natural language workflow description into a structured workflow definition.",
    inputSchema: {
      type: "object",
      required: ["task_id", "description"],
      properties: {
        task_id: { type: "string", format: "uuid" },
        description: { type: "string", maxLength: 4096 },
        constraints: {
          type: "object",
          properties: {
            max_bounty_lamports: { type: "integer" },
            deadline_hours: { type: "number", minimum: 0.5, maximum: 720 },
            required_capabilities: { type: "array", items: { type: "string" } },
            authorized_agent: { type: "string" },
          },
        },
        token_budget: { type: "integer", minimum: 256, maximum: 4096, default: 2048 },
      },
    },
  },

  {
    name: "attest_and_submit",
    description:
      "Submit a BLAKE3 execution proof to the Solana workflow-escrow program.",
    inputSchema: {
      type: "object",
      required: [
        "task_id",
        "workflow_id",
        "input_hash",
        "state_hash",
        "output_hash",
        "composite_hash",
        "execution_ns",
        "route_taken",
      ],
      properties: {
        task_id: { type: "string", format: "uuid" },
        workflow_id: { type: "string", format: "uuid" },
        input_hash: { type: "string", description: "Hex-encoded 32-byte BLAKE3 hash" },
        state_hash: { type: "string" },
        output_hash: { type: "string" },
        composite_hash: { type: "string" },
        execution_ns: { type: "integer" },
        route_taken: {
          type: "string",
          enum: ["fast_path", "mcp_analyze", "mcp_synthesize", "rejected"],
        },
        agent_keypair_path: { type: "string" },
      },
    },
  },
] as const;
