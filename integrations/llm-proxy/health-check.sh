#!/usr/bin/env bash
# ReflexWork — local-AI health check + alert.
#
# When you expose a local Ollama to the Pages chatbot (via ngrok/tunnel), the
# chain can break silently: ngrok's URL changes on restart, the laptop sleeps,
# or ollama stops — and the proxy quietly falls back to Gemini (or errors).
# This script checks each link and exits non-zero if the LOCAL path is down, so
# you can wire it to a cron / notifier.
#
# Usage:
#   ./health-check.sh                 # human-readable, exit 1 if local path down
#   ./health-check.sh --json          # machine-readable one-line JSON
#
# Checks:
#   1. ollama serving on localhost:11434
#   2. the model is pulled
#   3. the public proxy answers AND routes to ollama (source=ollama)
set -uo pipefail

PROXY="${PROXY:-https://reflexwork-llm-proxy.solana-thailand.workers.dev}"
MODEL="${OLLAMA_MODEL:-scb10x/llama3.2-typhoon2-3b-instruct}"
JSON=0; [ "${1:-}" = "--json" ] && JSON=1

ollama_up=0; model_ok=0; proxy_src="unknown"
curl -sf "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1 && ollama_up=1
if [ "$ollama_up" = 1 ]; then
  curl -s "http://127.0.0.1:11434/api/tags" | grep -q "$MODEL" && model_ok=1
fi
# ask the public proxy and read which backend answered. Retry once on a blip
# (cold ollama start / ngrok reconnect / laptop wake) before declaring it down,
# so a transient hiccup does not raise a false alert.
proxy_src=""
for attempt in 1 2; do
  resp=$(curl -s --max-time 30 -X POST "$PROXY/llm" \
    -H 'Content-Type: application/json' -H 'Origin: https://reflexwork.pages.dev' \
    -d '{"input":"healthcheck ping"}' 2>/dev/null)
  proxy_src=$(printf '%s' "$resp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).source||"gemini")}catch(e){console.log("error")}})' 2>/dev/null)
  [ "$proxy_src" = "ollama" ] && break
  [ "$attempt" = 1 ] && sleep 5
done

# local path is healthy only when the proxy actually answered FROM ollama
local_ok=0; [ "$proxy_src" = "ollama" ] && local_ok=1

if [ "$JSON" = 1 ]; then
  echo "{\"ollama_up\":$ollama_up,\"model_ok\":$model_ok,\"proxy_source\":\"$proxy_src\",\"local_path_ok\":$local_ok}"
else
  echo "ollama serving : $([ $ollama_up = 1 ] && echo ✓ || echo ✗)"
  echo "model pulled   : $([ $model_ok = 1 ] && echo ✓ || echo "✗ ($MODEL)")"
  echo "proxy backend  : $proxy_src"
  if [ "$local_ok" = 1 ]; then
    echo "→ LOCAL AI PATH HEALTHY ✓"
  else
    echo "→ ⚠ LOCAL AI PATH DOWN — chatbot is NOT using local model"
    echo "  likely: ngrok URL changed (re-run tunnel + 'wrangler secret put OLLAMA_URL'),"
    echo "  or ollama/laptop asleep. (Gemini fallback may still answer.)"
  fi
fi
exit $([ "$local_ok" = 1 ] && echo 0 || echo 1)
