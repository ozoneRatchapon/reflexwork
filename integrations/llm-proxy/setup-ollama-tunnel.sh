#!/usr/bin/env bash
# ReflexWork — expose a LOCAL Ollama model to the Pages chatbot via Cloudflare Tunnel.
#
# WHY: the chatbot on Cloudflare Pages calls the llm-proxy Worker, which runs on
# Cloudflare's edge and CANNOT reach your laptop's localhost. A tunnel gives the
# local Ollama box a public HTTPS URL the Worker CAN reach — then set that URL as
# the proxy's OLLAMA_URL secret and the LLM-path answers come from your local
# model (0 per-token cost, data stays on your machine except for the escalated
# question text which transits the tunnel to your own box).
#
# Usage:
#   ./setup-ollama-tunnel.sh [model]       # default model: gemma2:9b
#
# It will:
#   1. ensure the model is pulled and Ollama is serving (localhost:11434)
#   2. start a Cloudflare QUICK tunnel (no account/login needed) to :11434
#   3. print the public URL + the exact `wrangler secret put` commands to run
#
# Quick tunnels are free and ephemeral (URL changes each run) — perfect for a
# demo. For a stable URL use a NAMED tunnel (see docs/ollama-tunnel-runbook.md).
set -euo pipefail

MODEL="${1:-gemma2:9b}"
PORT=11434

command -v ollama >/dev/null || { echo "✗ ollama not installed — https://ollama.com/download"; exit 1; }
command -v cloudflared >/dev/null || { echo "✗ cloudflared not installed — 'brew install cloudflared'"; exit 1; }

echo "→ pulling model: $MODEL (skipped if already present)"
ollama pull "$MODEL"

if ! curl -s "http://127.0.0.1:${PORT}/api/tags" >/dev/null 2>&1; then
  echo "→ starting 'ollama serve' in the background (logs: \$KIROCREW_SCRATCH/ollama.log)"
  nohup ollama serve >"${KIROCREW_SCRATCH:-/tmp}/ollama.log" 2>&1 &
  sleep 2
fi
echo "✓ Ollama serving on http://127.0.0.1:${PORT}"

echo "→ starting Cloudflare quick tunnel to :${PORT} …"
echo "  (leave this running; the public URL appears below as https://<random>.trycloudflare.com)"
echo
echo "  ┌─ once you see the URL, in ANOTHER terminal run: ──────────────────────────"
echo "  │  cd integrations/llm-proxy"
echo "  │  echo '<THAT_URL>/v1/chat/completions' | npx wrangler secret put OLLAMA_URL"
echo "  │  echo '${MODEL}'                       | npx wrangler secret put OLLAMA_MODEL"
echo "  │  npx wrangler deploy"
echo "  └───────────────────────────────────────────────────────────────────────────"
echo
exec cloudflared tunnel --url "http://127.0.0.1:${PORT}"
