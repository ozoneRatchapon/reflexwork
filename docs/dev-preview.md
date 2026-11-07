# Developing the next version without touching the demo (preview deploys)

Production (`reflexwork.pages.dev`) is what the pitch shows. Work in progress goes to a **preview**: its own URL, the same code path, no production data.

## How
```
git switch -c feature/<name>            # gitflow: feature branches off the current line
# ... work, commit (the deploy script refuses uncommitted changes under submissions/ui)
zsh submissions/deploy_pages.sh <name>  # any name except "main" = PREVIEW
```
Cloudflare serves a preview at `https://<name>.reflexwork.pages.dev` (and a per-deploy hash URL). Only `main` updates `reflexwork.pages.dev`.

## What a preview does differently (stamped by `submissions/deploy_pages.sh`, read by the pages)
- every page gets `<meta name="robots" content="noindex">` (not indexed) and `<meta name="rw-env" content="preview">`;
- the **chat has no default kernel and no default LLM**: no gap-log entry, no vote, no `/live-kb` poll, no AI call reach the production workers; a banner says so;
- the **dashboard starts with an empty kernel base**, so approve / retract / draft cannot write to production;
- answers still come from the manual and the catalogue (the search runs in the browser), so retrieval, Rust/WASM and UI changes can be tried for real.
Connect a preview on purpose with `?api=<kernel>` / `?llm=<proxy>` (loopback, our workers or the same origin are accepted - see `safeBackend`).
`tests/chat_e2e.test.mjs` proves both halves: the production page is unchanged, the preview page makes no request to `workers.dev`.

## Not done yet (decisions for the owner)
- A **staging kernel + proxy** (separate Workers and a separate D1) so previews can exercise the gap / vote / live-answer loop without production data. Until then, previews are read-only toward the world.
- **Access control**: preview URLs are unlisted, not secret. If a build must not be seen, put the `*.reflexwork.pages.dev` previews behind Cloudflare Access.
- Preview builds use the committed `knowledge-index.json` rebuilt approved-only, like production: unreleased manual content (e.g. `docs/kb-faq-drafts/`) is not in them. To try draft content, build an index with it locally and serve `submissions/ui` yourself.

## Rule of thumb
Develop and preview freely; **only `deploy_pages.sh main` (and the worker deploys) changes what people see**. Do that after the demo, not before.
