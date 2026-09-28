/**
 * draft_workflow MCP Tool
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { v4 as uuidv4 } from "uuid";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-haiku-20241022-v1:0";

export async function draftWorkflow(args: Record<string, unknown>) {
  const {
    task_id,
    description,
    constraints = {},
    token_budget = 2048,
  } = args as {
    task_id: string;
    description: string;
    constraints: {
      max_bounty_lamports?: number;
      deadline_hours?: number;
      required_capabilities?: string[];
      authorized_agent?: string;
    };
    token_budget: number;
  };

  const workflowId = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const deadlineSecs = now + (constraints.deadline_hours ?? 24) * 3600;

  const systemPrompt = `You are a workflow design engine for a Solana-based escrow platform.
Given a natural language workflow description, output ONLY a JSON object:
{
  "task_id": "<uuid>",
  "workflow_id": "<uuid>",
  "title": "<string>",
  "steps": [
    {
      "step_id": <int>,
      "title": "<string>",
      "description": "<string>",
      "route": "fast_path|mcp_analyze|mcp_synthesize",
      "estimated_tokens": <int>
    }
  ],
  "suggested_bounty_lamports": <int>,
  "suggested_deadline_unix_s": <int>,
  "task_spec_hash_input": "<canonical JSON string to BLAKE3-hash>",
  "tokens_used": <int>
}
Keep steps atomic and executable. Use fast_path for deterministic operations.`;

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: token_budget,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Task ID: ${task_id}
Workflow ID (pre-assigned): ${workflowId}
Deadline timestamp: ${deadlineSecs}
Max bounty: ${constraints.max_bounty_lamports ?? 1_000_000} lamports
Required capabilities: ${constraints.required_capabilities?.join(", ") ?? "none specified"}

Workflow description:
${description}`,
      },
    ],
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  const response = await client.send(command);
  const bodyText = new TextDecoder().decode(response.body);
  const body = JSON.parse(bodyText) as { content: Array<{ text: string }> };
  const resultJson = body.content[0]?.text ?? "{}";

  return {
    isError: false,
    content: [{ type: "text" as const, text: resultJson }],
  };
}
