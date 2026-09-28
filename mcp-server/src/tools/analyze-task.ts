/**
 * analyze_task MCP Tool
 *
 * Uses Amazon Bedrock (via AWS SDK) to analyze task complexity,
 * decompose workflow steps, and detect risk flags.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-haiku-20241022-v1:0";

export async function analyzeTask(args: Record<string, unknown>) {
  const {
    task_id,
    raw_input,
    context_tags = [],
    token_budget = 2048,
  } = args as {
    task_id: string;
    raw_input: string;
    context_tags: string[];
    token_budget: number;
    workflow_id?: string;
  };

  const systemPrompt = `You are a task analysis engine for ReflexWork, an enterprise workflow platform.
Analyze the given task and return ONLY a JSON object (no markdown, no prose) matching this schema:
{
  "task_id": "<uuid>",
  "complexity_score": <number 0.0-1.0>,
  "workflow_steps": [{"step_id": <int>, "description": "<string>", "estimated_tokens": <int>, "requires_llm": <bool>}],
  "required_capabilities": ["<string>"],
  "risk_flags": [{"flag": "<string>", "severity": "low|medium|high"}],
  "recommended_route": "fast_path|mcp_analyze|mcp_synthesize|reject",
  "tokens_used": <int>
}`;

  const userMessage = `Task ID: ${task_id}
Context tags: ${context_tags.join(", ")}
Max tokens: ${token_budget}

Task description:
${raw_input}`;

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: token_budget,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
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
