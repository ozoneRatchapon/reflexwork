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
echo "deploying $(find "$ui" -type f | wc -l | tr -d ' ') files from $(git -C "$repo" rev-parse --short HEAD) to branch $branch"
npx --yes wrangler@4 pages deploy "$ui" --project-name=reflexwork --branch="$branch" \
  --commit-hash="$(git -C "$repo" rev-parse HEAD)" --commit-message="$(git -C "$repo" log -1 --format=%s)"
