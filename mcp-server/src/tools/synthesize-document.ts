/**
 * synthesize_document MCP Tool
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-haiku-20241022-v1:0";

export async function synthesizeDocument(args: Record<string, unknown>) {
  const {
    task_id,
    document_type,
    source_materials,
    output_language = "en",
    token_budget = 4096,
    style_hints = [],
  } = args as {
    task_id: string;
    document_type: string;
    source_materials: Array<{ label?: string; content: string; content_type?: string }>;
    output_language: string;
    token_budget: number;
    style_hints: string[];
  };

  const materialsText = source_materials
    .map((m, i) => `[Source ${i + 1}${m.label ? ` — ${m.label}` : ""}]\n${m.content}`)
    .join("\n\n");

  const systemPrompt = `You are a professional document synthesis engine.
Generate a ${document_type} in ${output_language}.
Style requirements: ${style_hints.join(", ") || "formal, structured"}.
You MUST output ONLY a JSON object:
{
  "task_id": "<uuid>",
  "document": "<full markdown document>",
  "word_count": <int>,
  "sections": ["<section heading>"],
  "tokens_used": <int>,
  "pdpa_safe": <bool>
}
If any personally identifiable information (PII) is detected, set pdpa_safe to false and redact it.`;

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: token_budget,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Task ID: ${task_id}\n\nSource materials:\n${materialsText}`,
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
