# Runbook: Production Hardening

> Steps to take ReflexWork from demo-grade to production-grade. Each is
> independent; do them before exposing to real users at scale.

## 1. Staff auth (KB authoring)
The kernel's `/kb-*` endpoints accept an optional `STAFF_TOKEN`. When set, only
callers sending a matching `X-Staff-Token` header may draft/approve/auto-draft.

```bash
# pick a strong random token (keep it secret)
TOKEN=$(openssl rand -hex 24)
cd integrations/kernel-worker
echo "$TOKEN" | npx wrangler secret put STAFF_TOKEN
npx wrangler deploy
# also set it on the LINE worker so #kb forwards it
cd ../line-worker
echo "$TOKEN" | npx wrangler secret put STAFF_TOKEN
npx wrangler deploy
```
Then in the dashboard, click **🔑 ตั้ง Staff Token** and paste the same value
(stored in localStorage, sent as `X-Staff-Token`). Without it, approve/auto-draft
return 401.

## 2. Protect the local-AI tunnel (OLLAMA_TOKEN)
A public ngrok/tunnel URL to Ollama is open to anyone who finds it. Set a bearer
token the proxy sends and your tunnel/relay checks:
```bash
cd integrations/llm-proxy
echo "$(openssl rand -hex 24)" | npx wrangler secret put OLLAMA_TOKEN
npx wrangler deploy
```
The proxy adds `Authorization: Bearer <OLLAMA_TOKEN>` to its Ollama calls.
Configure your tunnel/relay to require it (ngrok paid: request-header rule;
self-hosted relay: check the header). For production, prefer a **named tunnel +
your own domain** over a quick tunnel (stable URL), or move the model to a
server on the university network.

## 3. D1 backup
```bash
./integrations/kernel-worker/backup-d1.sh          # remote → backups/*.sql (gitignored)
# schedule it (cron/CI) before any migration or deploy that touches schema
```
Restore (reviewed, manual):
```bash
cd integrations/kernel-worker
npx wrangler d1 execute reflexwork --remote --file ../../backups/<file>.sql
```

## 4. Local-AI liveness
`./integrations/llm-proxy/health-check.sh` exits non-zero when the local path is
down. A KiroCrew cron runs it every 30 min and alerts only on failure.

## Still open (future)
- Rate limiting beyond per-isolate best-effort (use a KV/Durable Object counter).
- Load test the kernel + proxy under concurrency.
- Formal PDPA review of the gap_log retention window.
