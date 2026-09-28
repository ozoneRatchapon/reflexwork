# ReflexWork — MCP Tool Interface Specification

## Protocol: JSON-RPC 2.0 over stdio (MCP standard transport)

**Server Name**: `reflexwork-mcp`  
**Version**: `0.1.0`  
**Transport**: stdio (primary), SSE (secondary for web clients)  
**Capabilities**: `tools`, `resources`, `prompts`

---

## 1. Server Manifest

```json
{
  "name": "reflexwork-mcp",
  "version": "0.1.0",
  "description": "ReflexWork MCP Server — bridges Kiro Agent to the Reflex Kernel and Solana",
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": false, "listChanged": false },
    "prompts": { "listChanged": false }
  }
}
```

---

## 2. Tool Definitions

### 2.1 `analyze_task`

Performs deep natural language analysis of a task specification. Called by the
Reflex Kernel when `gate_score ≥ θ_gate` and route is `McpAnalyze`.

```json
{
  "name": "analyze_task",
  "description": "Analyze a complex task specification and return structured metadata: complexity score, suggested workflow steps, required capabilities, and risk flags.",
  "inputSchema": {
    "type": "object",
    "required": ["task_id", "raw_input", "context_tags"],
    "properties": {
      "task_id": {
        "type": "string",
        "format": "uuid",
        "description": "UUIDv4 identifier for this task (from TaskSpec.id)"
      },
      "raw_input": {
        "type": "string",
        "maxLength": 8192,
        "description": "The raw natural language or structured task description"
      },
      "context_tags": {
        "type": "array",
        "items": { "type": "string" },
        "maxItems": 32,
        "description": "Keyword tags from TaskSpec for feature context"
      },
      "token_budget": {
        "type": "integer",
        "minimum": 256,
        "maximum": 8192,
        "default": 2048,
        "description": "Maximum tokens to consume for this analysis"
      },
      "workflow_id": {
        "type": "string",
        "format": "uuid",
        "description": "Optional: parent workflow identifier for multi-step tasks"
      }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "task_id": { "type": "string", "format": "uuid" },
      "complexity_score": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 1.0,
        "description": "Normalized complexity estimate [0.0, 1.0]"
      },
      "workflow_steps": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "step_id": { "type": "integer" },
            "description": { "type": "string" },
            "estimated_tokens": { "type": "integer" },
            "requires_llm": { "type": "boolean" }
          }
        }
      },
      "required_capabilities": {
        "type": "array",
        "items": { "type": "string" },
        "description": "e.g. ['document_parsing', 'code_review', 'multilingual']"
      },
      "risk_flags": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "flag": { "type": "string" },
            "severity": { "type": "string", "enum": ["low", "medium", "high"] }
          }
        }
      },
      "recommended_route": {
        "type": "string",
        "enum": ["fast_path", "mcp_analyze", "mcp_synthesize", "reject"],
        "description": "Suggested route for the Reflex Kernel to use"
      },
      "tokens_used": { "type": "integer" }
    }
  }
}
```

---

### 2.2 `synthesize_document`

Generates a structured document or report from raw inputs. Used for research
synthesis, compliance report generation, and workflow documentation.

```json
{
  "name": "synthesize_document",
  "description": "Generate a structured document (report, spec, summary) from provided source materials. Returns markdown-formatted output with section structure.",
  "inputSchema": {
    "type": "object",
    "required": ["task_id", "document_type", "source_materials"],
    "properties": {
      "task_id": {
        "type": "string",
        "format": "uuid"
      },
      "document_type": {
        "type": "string",
        "enum": [
          "compliance_report",
          "workflow_spec",
          "executive_summary",
          "technical_design",
          "audit_trail_summary"
        ]
      },
      "source_materials": {
        "type": "array",
        "minItems": 1,
        "maxItems": 10,
        "items": {
          "type": "object",
          "required": ["content"],
          "properties": {
            "label": { "type": "string" },
            "content": { "type": "string", "maxLength": 4096 },
            "content_type": {
              "type": "string",
              "enum": ["text", "json", "markdown", "csv"]
            }
          }
        }
      },
      "output_language": {
        "type": "string",
        "default": "en",
        "description": "ISO 639-1 language code (en, th, ja, zh, etc.)"
      },
      "token_budget": {
        "type": "integer",
        "minimum": 512,
        "maximum": 8192,
        "default": 4096
      },
      "style_hints": {
        "type": "array",
        "items": { "type": "string" },
        "description": "e.g. ['formal', 'bullet_points', 'pdpa_compliant']"
      }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "task_id": { "type": "string", "format": "uuid" },
      "document": {
        "type": "string",
        "description": "Markdown-formatted synthesized document"
      },
      "word_count": { "type": "integer" },
      "sections": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Top-level section headings extracted from document"
      },
      "tokens_used": { "type": "integer" },
      "pdpa_safe": {
        "type": "boolean",
        "description": "True if no PII was detected in source or output"
      }
    }
  }
}
```

---

### 2.3 `query_knowledge_base`

Semantic search over the enterprise knowledge base (RAG).
Allows the agent to retrieve relevant policy documents, SOPs, or prior task history.

```json
{
  "name": "query_knowledge_base",
  "description": "Perform semantic search over the organization's indexed knowledge base. Returns ranked relevant passages with source citations.",
  "inputSchema": {
    "type": "object",
    "required": ["task_id", "query"],
    "properties": {
      "task_id": { "type": "string", "format": "uuid" },
      "query": {
        "type": "string",
        "maxLength": 1024,
        "description": "Natural language query"
      },
      "top_k": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20,
        "default": 5
      },
      "filters": {
        "type": "object",
        "properties": {
          "document_types": {
            "type": "array",
            "items": { "type": "string" }
          },
          "date_range": {
            "type": "object",
            "properties": {
              "from_unix_s": { "type": "integer" },
              "to_unix_s": { "type": "integer" }
            }
          },
          "tags": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      },
      "min_relevance_score": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 1.0,
        "default": 0.7
      }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "task_id": { "type": "string", "format": "uuid" },
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "rank": { "type": "integer" },
            "content": { "type": "string" },
            "source": { "type": "string", "description": "Document path or URL" },
            "relevance_score": { "type": "number" },
            "snippet": { "type": "string" }
          }
        }
      },
      "total_found": { "type": "integer" },
      "tokens_used": { "type": "integer" }
    }
  }
}
```

---

### 2.4 `draft_workflow`

Generates a structured, machine-executable workflow definition from a natural language
description. Output is compatible with `WorkflowEscrow.initialize_workflow` parameters.

```json
{
  "name": "draft_workflow",
  "description": "Convert a natural language workflow description into a structured workflow definition ready for onchain escrow initialization.",
  "inputSchema": {
    "type": "object",
    "required": ["task_id", "description"],
    "properties": {
      "task_id": { "type": "string", "format": "uuid" },
      "description": {
        "type": "string",
        "maxLength": 4096,
        "description": "Natural language description of the workflow to execute"
      },
      "constraints": {
        "type": "object",
        "properties": {
          "max_bounty_lamports": { "type": "integer" },
          "deadline_hours": {
            "type": "number",
            "minimum": 0.5,
            "maximum": 720
          },
          "required_capabilities": {
            "type": "array",
            "items": { "type": "string" }
          },
          "authorized_agent": {
            "type": "string",
            "description": "Solana pubkey (base58) of authorized executor, if restricted"
          }
        }
      },
      "token_budget": {
        "type": "integer",
        "minimum": 256,
        "maximum": 4096,
        "default": 2048
      }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "task_id": { "type": "string", "format": "uuid" },
      "workflow_id": {
        "type": "string",
        "format": "uuid",
        "description": "Generated workflow UUID for use as WorkflowEscrow.workflow_id"
      },
      "title": { "type": "string" },
      "steps": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "step_id": { "type": "integer" },
            "title": { "type": "string" },
            "description": { "type": "string" },
            "route": {
              "type": "string",
              "enum": ["fast_path", "mcp_analyze", "mcp_synthesize"]
            },
            "estimated_tokens": { "type": "integer" }
          }
        }
      },
      "suggested_bounty_lamports": { "type": "integer" },
      "suggested_deadline_unix_s": { "type": "integer" },
      "task_spec_hash_input": {
        "type": "string",
        "description": "Canonical JSON string to BLAKE3-hash as task_spec_hash"
      },
      "tokens_used": { "type": "integer" }
    }
  }
}
```

---

### 2.5 `attest_and_submit`

Internal tool: called by the Reflex Kernel (not directly by the LLM) to submit a
BLAKE3 attestation proof to the Solana Anchor program after MCP tool execution.

```json
{
  "name": "attest_and_submit",
  "description": "Submit a BLAKE3 execution proof to the Solana workflow-escrow program. Verifies composite hash locally before broadcasting.",
  "inputSchema": {
    "type": "object",
    "required": [
      "task_id", "workflow_id",
      "input_hash", "state_hash", "output_hash", "composite_hash",
      "execution_ns", "route_taken"
    ],
    "properties": {
      "task_id": { "type": "string", "format": "uuid" },
      "workflow_id": { "type": "string", "format": "uuid" },
      "input_hash": {
        "type": "string",
        "description": "Hex-encoded 32-byte BLAKE3 hash of TaskSpec"
      },
      "state_hash": {
        "type": "string",
        "description": "Hex-encoded 32-byte BLAKE3 hash of PersonalitySnapshot"
      },
      "output_hash": {
        "type": "string",
        "description": "Hex-encoded 32-byte BLAKE3 hash of execution output"
      },
      "composite_hash": {
        "type": "string",
        "description": "Hex-encoded 32-byte BLAKE3(input||state||output)"
      },
      "execution_ns": {
        "type": "integer",
        "description": "Wall-clock execution time in nanoseconds"
      },
      "route_taken": {
        "type": "string",
        "enum": ["fast_path", "mcp_analyze", "mcp_synthesize", "rejected"]
      },
      "agent_keypair_path": {
        "type": "string",
        "description": "Path to agent's Solana keypair file (default: ~/.config/solana/id.json)"
      }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "transaction_signature": {
        "type": "string",
        "description": "Solana transaction signature (base58)"
      },
      "attestation_pda": {
        "type": "string",
        "description": "Pubkey of the created TaskAttestation PDA"
      },
      "slot": { "type": "integer" },
      "error": { "type": "string", "description": "Error message if success=false" }
    }
  }
}
```

---

## 3. JSON-RPC Request/Response Examples

### Example: `analyze_task` Request
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "tools/call",
  "params": {
    "name": "analyze_task",
    "arguments": {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "raw_input": "Review Q3 compliance reports from all departments and flag any PDPA violations.",
      "context_tags": ["compliance", "pdpa", "document_review"],
      "token_budget": 1024
    }
  }
}
```

### Example: `analyze_task` Response
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"task_id\":\"550e8400-e29b-41d4-a716-446655440000\",\"complexity_score\":0.71,\"workflow_steps\":[{\"step_id\":1,\"description\":\"Retrieve Q3 reports from knowledge base\",\"estimated_tokens\":256,\"requires_llm\":false},{\"step_id\":2,\"description\":\"Parse and classify each report\",\"estimated_tokens\":512,\"requires_llm\":true},{\"step_id\":3,\"description\":\"Flag PDPA violations\",\"estimated_tokens\":256,\"requires_llm\":true}],\"required_capabilities\":[\"document_parsing\",\"compliance_check\",\"multilingual\"],\"risk_flags\":[{\"flag\":\"contains_pii\",\"severity\":\"high\"},{\"flag\":\"multi_document\",\"severity\":\"medium\"}],\"recommended_route\":\"mcp_synthesize\",\"tokens_used\":387}"
      }
    ],
    "isError": false
  }
}
```

---

## 4. Resource Definitions

```json
{
  "resources": [
    {
      "uri": "reflexwork://policy/current",
      "name": "Current Policy State",
      "description": "The current PolicyState and PersonalitySnapshot from the Reflex Kernel",
      "mimeType": "application/json"
    },
    {
      "uri": "reflexwork://workflows/active",
      "name": "Active Workflows",
      "description": "List of currently active WorkflowEscrow accounts on Solana Devnet",
      "mimeType": "application/json"
    },
    {
      "uri": "reflexwork://budget/ledger",
      "name": "Budget Ledger",
      "description": "Current token budget consumption across all active tasks",
      "mimeType": "application/json"
    }
  ]
}
```

---

## 5. Prompt Templates

```json
{
  "prompts": [
    {
      "name": "compliance_review",
      "description": "Structured prompt for PDPA-compliant document review tasks",
      "arguments": [
        { "name": "document_content", "description": "Document to review", "required": true },
        { "name": "regulation", "description": "Regulation to check against (default: PDPA)", "required": false }
      ]
    },
    {
      "name": "workflow_decomposer",
      "description": "Decomposes a high-level goal into executable workflow steps",
      "arguments": [
        { "name": "goal", "description": "High-level objective", "required": true },
        { "name": "constraints", "description": "Budget/time constraints as JSON", "required": false }
      ]
    }
  ]
}
```

---

## 6. Error Codes (MCP Standard + ReflexWork Extensions)

| Code | Name | Description |
|------|------|-------------|
| -32700 | ParseError | Invalid JSON received |
| -32600 | InvalidRequest | Request object malformed |
| -32601 | MethodNotFound | Tool name not found |
| -32602 | InvalidParams | Tool parameters invalid |
| -32603 | InternalError | Internal server error |
| -32001 | BudgetExceeded | Token budget exceeded before completion |
| -32002 | DeadlineExceeded | Task deadline passed during execution |
| -32003 | SolanaRpcError | Solana RPC call failed |
| -32004 | ProofVerifyFailed | BLAKE3 composite hash verification failed |
| -32005 | AgentNotRegistered | Agent has no onchain AgentStateRecord |
