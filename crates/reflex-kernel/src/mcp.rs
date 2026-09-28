//! MCP client: JSON-RPC 2.0 communication with the MCP server process.
//!
//! Uses stdio transport — spawns the MCP server as a child process and
//! communicates via stdin/stdout per the MCP specification.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::KernelError;

// ─── JSON-RPC types ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: String,
    method: String,
    params: Value,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: String,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

// ─── Tool result types ────────────────────────────────────────────────────────

/// Parsed output from `analyze_task` tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeTaskResult {
    pub task_id: Uuid,
    pub complexity_score: f32,
    pub recommended_route: String,
    pub risk_flags: Vec<RiskFlag>,
    pub tokens_used: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskFlag {
    pub flag: String,
    pub severity: String,
}

/// Parsed output from `synthesize_document` tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthesizeDocumentResult {
    pub task_id: Uuid,
    pub document: String,
    pub word_count: u32,
    pub pdpa_safe: bool,
    pub tokens_used: u32,
}

// ─── MCP Client ───────────────────────────────────────────────────────────────

/// Async client for the ReflexWork MCP server.
///
/// In production, this spawns the MCP server process and communicates via stdio.
/// For testing, a mock can be injected via the `MockMcpClient` feature flag.
pub struct McpClient {
    server_command: String,
    server_args: Vec<String>,
}

impl McpClient {
    pub fn new(command: impl Into<String>, args: Vec<String>) -> Self {
        Self {
            server_command: command.into(),
            server_args: args,
        }
    }

    /// Call the `analyze_task` MCP tool.
    pub async fn analyze_task(
        &self,
        task_id: Uuid,
        raw_input: &str,
        context_tags: &[String],
        token_budget: u32,
    ) -> Result<AnalyzeTaskResult, KernelError> {
        let params = json!({
            "name": "analyze_task",
            "arguments": {
                "task_id": task_id.to_string(),
                "raw_input": raw_input,
                "context_tags": context_tags,
                "token_budget": token_budget
            }
        });

        let response = self.call_tool("tools/call", params).await?;
        let text = extract_text_content(&response)?;
        serde_json::from_str::<AnalyzeTaskResult>(&text)
            .map_err(|e| KernelError::McpError(format!("analyze_task parse error: {e}")))
    }

    /// Call the `synthesize_document` MCP tool.
    pub async fn synthesize_document(
        &self,
        task_id: Uuid,
        document_type: &str,
        source_materials: Vec<Value>,
        output_language: &str,
        token_budget: u32,
    ) -> Result<SynthesizeDocumentResult, KernelError> {
        let params = json!({
            "name": "synthesize_document",
            "arguments": {
                "task_id": task_id.to_string(),
                "document_type": document_type,
                "source_materials": source_materials,
                "output_language": output_language,
                "token_budget": token_budget
            }
        });

        let response = self.call_tool("tools/call", params).await?;
        let text = extract_text_content(&response)?;
        serde_json::from_str::<SynthesizeDocumentResult>(&text)
            .map_err(|e| KernelError::McpError(format!("synthesize_document parse error: {e}")))
    }

    // ── Low-level JSON-RPC call ───────────────────────────────────────────────

    async fn call_tool(&self, method: &str, params: Value) -> Result<Value, KernelError> {
        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id: Uuid::new_v4().to_string(),
            method: method.to_string(),
            params,
        };

        // In a real implementation this would write to the child process stdin
        // and read from stdout. This stub returns an error to indicate it's
        // not yet connected, without panicking.
        let _serialized = serde_json::to_string(&request)?;

        // TODO: Implement actual stdio transport
        // let mut child = tokio::process::Command::new(&self.server_command)
        //     .args(&self.server_args)
        //     .stdin(std::process::Stdio::piped())
        //     .stdout(std::process::Stdio::piped())
        //     .spawn()?;
        // ...

        Err(KernelError::McpError(
            "MCP stdio transport not yet connected — implement in mcp/transport.rs".into()
        ))
    }
}

fn extract_text_content(value: &Value) -> Result<String, KernelError> {
    value["content"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|item| item["text"].as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| KernelError::McpError("no text content in MCP response".into()))
}
