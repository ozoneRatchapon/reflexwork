# Presentation versions - which one is which (2026-11-05)

**Use for the stage (Pitching Day, 5 minutes): `submissions/ui/pitch.html`** (live: `/pitch`). Script: `docs/pitching/10-pitch-script-5min.md`.
Every number on it is checked against a fresh measurement by `node tests/pitch_claims.test.mjs`; the one-idea-per-slide rule (<= 45 words) by `tests/pitch_deck.test.mjs`.

| file | what it is | status |
|---|---|---|
| `submissions/ui/pitch.html` | 8-slide deck for the 5-minute pitch | **current - the only one to present** |
| `submissions/ui/how-it-works.html` (`/how-it-works`) | 16-slide reading deck: how a question travels, for everyone / staff / executives / developers | current, for reading and Q&A, not for the stage; numbers checked by `tests/how_it_works.test.mjs` |
| `submissions/ui/slides.html` (`/slides.html`) | the 19-slide deck of the first-round submission (31 Oct); numbers refreshed since, see the banner on it | kept live because the submission links to it; **not the pitch deck** |
| `git tag submission-2026-10-31` | the repository exactly as it was when the first-round submission was made (last commit before `SOURCE-LINK.txt` was written) | the original, byte for byte: `git show submission-2026-10-31:submissions/ui/slides.html` |
| `submissions/archive/pitch-old.html` | the first 9-slide pitch draft (2 Nov) | archived, do not use (it does not load without `submissions/ui/theme.css`; see the tag for a working copy) |
| `submissions/archive/slides-root-2026-10-16.html` | an old copy of the deck that sat next to `ui/` and was never deployed | archived |
| `submissions/one-pager.html`, `submissions/concept-paper.*` | leave-behind / submission documents | current for what they are (numbers in the one-pager date from 17 Oct) |
| `submissions/video/*.mp4` | recorded demo / explainer videos (backup if the live page fails) | check the date before using |
| `docs/pitching/*.md` | scripts, runbooks, Q&A bank, evidence | `10-pitch-script-5min.md` and `80-demo-runbook.md` current; `30-demo-runbook.md` older runbook - prefer `80` |

Rule: a number is only said or shown if a command in the repo can reproduce it. The NotebookLM scripts (v1/v2) are superseded - see the table at the end of `docs/pitching/10-pitch-script-5min.md`.
