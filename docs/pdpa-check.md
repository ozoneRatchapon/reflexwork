# PDPA check: what personal data the chat moves and keeps (2026-11-09)

The owner asked for this before plan 008 step 6. It is a technical review of the code and the live endpoints, checked against PDPA
principles (B.E. 2562: purpose, minimisation, retention, notice, transfer abroad, security). **It is not a legal opinion.** The
university's DPO or legal office must sign off before the free-text box (plan 008 step 6) or any new data collection goes live.

## Where question text goes
| flow | what is sent / kept | who sees it | retention | status |
|---|---|---|---|---|
| web chat -> manual search | nothing leaves the browser (Rust/WASM search in the page) | - | chat history in this tab only (`sessionStorage`), cleared by closing the tab or the 🗑️ button | ok |
| web chat -> AI proxy (`/rewrite`, `/llm`) -> Google Gemini | question text, **masked since this check** (below); for `/llm` also manual text | Google (outside Thailand) | Google's API terms; the proxy keeps nothing | **fixed now**: was the raw text |
| web chat -> `/gap` (kernel worker, D1 `gap_log`) | masked question sample (200 chars), count, time, source | staff dashboard, and anyone: `GET /gaps` is public (30 rows) | newest 200 distinct rows, no time limit | mask improved now; public read is **open** (O1) |
| web chat -> `/feedback` | masked question (used only for the request check, not stored), vote, entry id, a random vote id | stored: vote id/hash, reward, time; per-entry counts | `feedback_log` has no limit | ok (no text stored) |
| `/route` audit (D1 `audit`) | category, route, timing, a BLAKE3 hash of question + route | public `GET /audit` (50 rows) | newest 100 rows | ok: a hash of a short question can be guessed by trying candidates, but it does not show the text |
| auto-draft (cron, staff button) -> Gemini | the masked gap samples | Google | - | ok once the mask is good; same transfer abroad as above |
| intake (account / system problem) | not logged; the page shows staff contacts | - | - | ok (`tests/privacy.test.mjs` checks it) |
| LINE -> kernel `/route`, `/gap` | `/route`: raw text, only a hash is kept (as web); `/gap`: masked by the Rust mask in the LINE worker, and again in the kernel | as web | as web | fixed 2026-11-10 (O2) |
| LINE advice questions -> AI proxy | masked question (Rust mask) + manual context | Google | - | fixed 2026-11-10 (O2) |
| AI proxy logs | the first 80 characters of an input that looks like a prompt injection (`console.log`) | Cloudflare logs (`wrangler tail`; no Logpush in `wrangler.toml`) | Cloudflare's log retention | minor (O3) |

## Fixed in this change
- One mask in Rust (`crates/pii-mask`, `mask_pii`; the page gets it through reflex-wasm, the workers load it as wasm), used by the page for every copy of a question that leaves the
  browser: the AI proxy (`/rewrite`, `/llm`), the vote and the gap list. It removes emails, Thai national ids (13 digits in any
  grouping), phone numbers (0x, +66), account ids (7+ digits, or a letter + 6+ digits), LINE ids after a label, and names after a
  title (นาย / นาง / นางสาว / น.ส. / Mr / Mrs / Ms / Miss) or after "ชื่อ" / "ชื่อ-สกุล" / "นามสกุล". Roles that start with a
  title (นายทะเบียน, นายจ้าง, ...) stay readable. Money amounts and years stay (ค่าเทอม 100000 บาท, 2569).
- Before: the gap copy used a JS scrubber (no national id with dashes, no +66, no titles, no LINE ids), and the AI proxy got the
  **unmasked** text.
- Tests: `cargo test -p pii-mask` (what is masked and what must stay) and `tests/privacy.test.mjs`, which runs
  the page's scrubber against the shipped wasm file and fails if any request body carries the raw question.

## Limits of the mask
- A bare name with no title or label ("สมชาย ขอใบรับรอง") cannot be told from other Thai words and is NOT masked. The chat note
  ("อย่าพิมพ์ข้อมูลส่วนตัวในแชต") stays the main control.
- After a title, Thai has no word spaces: without a surname the next word is also masked ("นาย สมชาย ขอถาม" -> "[name]").
  Over-masking is the safe side.
- Addresses, birth dates and free-text health details have no reliable shape; they are not masked.

## Open, for the owner
- **O1 (fixed 2026-11-09, plan 016 item 2). `GET /gaps` was public.** Anyone can read the 30 most-asked unanswered questions (masked). The public dashboard shows them.
  Option: the public view shows counts and topics only; the samples need the staff token (like `/kb-drafts`). This changes what the
  public dashboard shows, so it is the owner's call.
- **O2 (fixed 2026-11-10, plan 016 item 13: the mask is its own Rust crate `crates/pii-mask`, loaded as wasm by the kernel worker (gap sample and key) and the LINE worker (before `askTeam` and `/gap`); `tests/line_bot.test.mjs`, `tests/line_grounded.test.mjs`). LINE used the older JS mask for gaps and sent raw text to the AI for advice questions.** The fix is to load the same wasm
  in the LINE worker (plan 009 "LINE loads the same wasm"; measure the Workers cold start first), then call `mask_pii` before
  `askTeam` and `/gap`. Needs a LINE worker deploy.
- **O3 (fixed 2026-11-09, plan 016 item 3). Retention by time.** `gap_log` is capped at 200 rows but has no age limit; `feedback_log` has neither. Suggest: delete gap
  rows older than 180 days in the daily cron, and vote rows older than a year. Needs a kernel worker deploy.
- **O4 (fixed 2026-11-10: the note says the AI is an outside service that may be abroad (plan 016 item 1), and links the university's data-rights page https://privacy.mahidol.ac.th/how-do-i-submit-a-subject-access-request/ (Data Subject Request Form v1.0: the university acts within 30 days of a complete request). Left open: the form leaves the submission e-mail blank for each unit to fill in, so the Graduate School's own address for these requests is still to confirm with the school). Notice.** The chat note says what is logged and how to turn the AI off (`?ai=off`). It does not say the AI is a Google
  service outside Thailand. Suggest adding that, plus a contact for data requests, in the note and in a short privacy page.
- **O5. Formal sign-off** by the university (DPO / legal): purpose of each flow, legal basis, the Gemini transfer abroad (section 28),
  retention periods.

## Plan 008 step 6 (free-text "what is the right answer?" box)
Not ready yet. It may go ahead only after: (1) steps 1-5 work; (2) O1 is closed for this data (staff-only read, never public);
(3) the text goes through `mask_pii` before it is stored; (4) a time limit (O3); (5) a privacy line next to the box; (6) O5 sign-off.
