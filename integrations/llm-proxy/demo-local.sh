#!/usr/bin/env bash
# ReflexWork — one-command LOCAL demo: chatbot + local Typhoon, no cloud, 0 token.
#
# Starts (if not already up): ollama serve, the local LLM proxy, and a static
# server for the chatbot UI, then prints the URL to open. The chatbot's kernel
# still runs in-browser (WASM); only the LLM-path (escalated) questions go to
# the local model via the proxy.
#
# Usage:   ./demo-local.sh [model]     # default: scb10x/llama3.2-typhoon2-3b-instruct
# Stop:    ./demo-local.sh stop
set -euo pipefail
cd "$(dirname "$0")/../.."                 # repo root

MODEL="${1:-scb10x/llama3.2-typhoon2-3b-instruct}"
PROXY_PORT=8787
UI_PORT=5173
PIDFILE="${TMPDIR:-/tmp}/reflexwork-demo.pids"

if [ "${1:-}" = "stop" ]; then
  [ -f "$PIDFILE" ] && while read -r p; do kill "$p" 2>/dev/null || true; done < "$PIDFILE"
  rm -f "$PIDFILE"; echo "✓ stopped demo (proxy + ui server). Ollama left running."; exit 0
fi

command -v ollama >/dev/null || { echo "✗ ollama not installed — https://ollama.com/download"; exit 1; }
: > "$PIDFILE"

ollama pull "$MODEL" >/dev/null 2>&1 || true
if ! curl -s "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  nohup ollama serve >"${TMPDIR:-/tmp}/reflexwork-ollama.log" 2>&1 & echo $! >> "$PIDFILE"; sleep 3
fi

OLLAMA_MODEL="$MODEL" PORT="$PROXY_PORT" \
  nohup node integrations/llm-proxy/local-llm-proxy.mjs >"${TMPDIR:-/tmp}/reflexwork-proxy.log" 2>&1 &
echo $! >> "$PIDFILE"; sleep 1

nohup python3 -m http.server "$UI_PORT" --bind 127.0.0.1 --directory submissions/ui \
  >"${TMPDIR:-/tmp}/reflexwork-ui.log" 2>&1 & echo $! >> "$PIDFILE"; sleep 1

echo "✓ ReflexWork local demo is up — model: $MODEL"
echo
echo "   OPEN:  http://127.0.0.1:${UI_PORT}/chatbot.html?api=http://127.0.0.1:${PROXY_PORT}"
echo
echo "   • FAQ / factual question  → FastPath from KB (0 token, verified)"
echo "   • open-ended question     → LLM path → LOCAL Typhoon (0 token, no data leaves the box)"
echo "   stop with:  ./integrations/llm-proxy/demo-local.sh stop"
