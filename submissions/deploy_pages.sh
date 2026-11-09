#!/bin/zsh
# Deploy the static UI to Cloudflare Pages from COMMITTED files only.
#   submissions/deploy_pages.sh <branch>        e.g. main (production) or feature/x (preview)
# Never deploy the working folder (`wrangler pages deploy ui`): it also uploads git-ignored, approval-gated
# data (ui/knowledge/ = another team's drafts) - that is how it once became public.
# Staged = `git archive HEAD submissions/ui` + knowledge-index.json rebuilt approved-only (same as CI).
set -e
branch=${1:?usage: deploy_pages.sh <branch>}
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
[ -z "$(git -C "$repo" status --porcelain -- submissions/ui ':!submissions/ui/knowledge-index.json')" ] \
  || { echo "ABORT: uncommitted changes under submissions/ui - commit them first"; exit 1; }
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
git -C "$repo" archive HEAD submissions/ui | tar -x -C "$out"
python3 -I "$repo/submissions/build_knowledge_index.py" >/dev/null
cp "$repo/submissions/ui/knowledge-index.json" "$out/submissions/ui/knowledge-index.json"
ui="$out/submissions/ui"
[ ! -e "$ui/knowledge" ] || { echo "ABORT: knowledge/ in deploy folder"; exit 1; }
for f in chatbot.html programmes.json knowledge-index.json wasm/reflex_wasm_bg.wasm; do
  [ -s "$ui/$f" ] || { echo "ABORT: missing $f"; exit 1; }
done
# The per-page CSP in _headers lists a SHA-256 per inline script: a page whose script changed after the last `cargo run -p pages-csp`
# would ship with its script refused by the browser. Checked on the staged (committed) files, before the preview stamp (which leaves scripts alone).
cargo run -q --manifest-path "$repo/Cargo.toml" -p pages-csp -- --check --ui "$ui" \
  || { echo "ABORT: _headers CSP is stale - run: cargo run -q -p pages-csp, then commit submissions/ui/_headers"; exit 1; }
# A deploy from any branch other than main is a PREVIEW (its own URL, production untouched). Stamp every page: not indexed, and the chat / dashboard
# default to NO production backend (see PREVIEW in chatbot.html, dashboard.html). main is the production deploy and is left exactly as committed.
if [ "$branch" != "main" ]; then
  for f in "$ui"/*.html; do perl -0pi -e 's/<head>/<head><meta name="robots" content="noindex"><meta name="rw-env" content="preview">/' "$f"; done
  echo "PREVIEW deploy (branch $branch): pages stamped noindex + rw-env=preview; the chat and dashboard use no production backend unless ?api= / ?llm= says so"
fi
echo "deploying $(find "$ui" -type f | wc -l | tr -d ' ') files from $(git -C "$repo" rev-parse --short HEAD) to branch $branch"
npx --yes wrangler@4 pages deploy "$ui" --project-name=reflexwork --branch="$branch" \
  --commit-hash="$(git -C "$repo" rev-parse HEAD)" --commit-message="$(git -C "$repo" log -1 --format=%s)"
