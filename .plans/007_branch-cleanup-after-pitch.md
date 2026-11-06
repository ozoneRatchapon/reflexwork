# 007 - Branch cleanup (deferred until after the 2026-11-07 pitch)

Decision 2026-11-06: do NOT delete anything before the pitch. Nothing was deleted.

## Findings (checked 2026-11-06 against origin/main with `git merge-base --is-ancestor`)
- 95 local branches and 93 remote branches are fully merged into main: deleting them loses no commit.
- Keep: `main`, `feature/qa-round1-fixes` (open PR #151; production Pages was deployed from it), `feature/modelless-npc` (development, preview `modelless-npc`).
- Ask the owner first:
  - local `backup/local-main-41e44c3`: a backup with 1 commit (15 Oct, "Mahidol hackathon package") that is NOT in main and has no remote copy. Deleting it loses that commit (only reflog for a while).
  - remote `origin/fix/slide6-and-fingerprint-wording`: 1 commit, same subject as `f525e12` merged in PR #98 (superseded as far as we can tell; `git cherry` cannot confirm because main has moved on).
- The submitted state is preserved by tag `submission-2026-10-31`, not by any branch.

## How (when approved)
```
# local: only branches verified as ancestors of origin/main
git fetch --prune origin
keep='^(main|feature/modelless-npc|feature/qa-round1-fixes|backup/local-main-41e44c3)$'
git for-each-ref --format='%(refname:short)' refs/heads | rg -v "$keep" | while read b; do git merge-base --is-ancestor $b origin/main && git branch -D $b; done
# remote (outward-facing): same check, then   git push origin --delete <branch>   (or: gh api -X DELETE repos/<owner>/<repo>/git/refs/heads/<branch>)
```
Do it after PR #151 is merged (then `feature/qa-round1-fixes` and, once merged, `feature/modelless-npc` can go too). Cloudflare Pages preview aliases are separate from git branches (list: `wrangler pages deployment list --project-name=reflexwork`).
