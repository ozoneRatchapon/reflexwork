# 019 - Self-serve roadmap: everything the dev team can do without anyone's sign-off (2026-11-14)

Scope: only work that needs no owner, College, Graduate School or university input. Gated work stays in plans 016 / 018.
Order = dependency order; each phase starts when the one before is merged and CI is green.

## Rules for every step
- One step = one commit (conventional message); a feature branch per phase, merged with `--no-ff`.
- Gate per commit: `cargo test -p reflex-wasm` green, `node benchmark/golden/route_golden.mjs --check` 0 differences,
  `node benchmark/golden/route_rust_check.mjs` green, every `tests/*.test.mjs` green, `cargo clippy` 0 warnings.
- After a page JS edit: `cargo run -q -p pages-csp` and `node tests/chat_e2e.test.mjs`.
- After every merge to `main`: **`gh run list --branch main` must show success before reporting done** (missed after `db6afad`).
- A golden re-record is a decision: list every changed row in the commit message file with why it is better. After a write-mode dump,
  restore the goldens that were not meant to change.
- Deploys are not part of this plan's steps; each deploy is asked for, with the D1 backup first.

## Phase 0 - close what is open (branch `feature/music-college-pack`)
- [ ] 0.1 Commit the CI fix (`tests/a11y_chat.test.mjs`), the pack changes and `tests/music_pack.test.mjs`; push; CI green on the branch.
- [ ] 0.2 Merge into `main`; CI green on `main`.
- [x] 0.3 Memory: "check CI on main after every merge before saying done".
Done when: `main` CI is green.

## Phase 1 - engine answers right on ties and round numbers (branch `feature/tie-and-round`)
Diagnosis corrected 2026-11-14 by step 1.1: "ปริญญาโทมีรอบ 5 ไหม" was NOT a tie. The search scored master majors 6 (its title shares
"ปริญญาโทมี" with the question) and round 5 only 3 (it said "บัณฑิตศึกษา", never "ปริญญาโท"). The earlier "5-5 tie" note was wrong.
- [x] 1.1 Bench `cargo run -q --release -p reflex-bench --bin tie_census -- --write` -> `benchmark/tie/001_2026-11-13_tie_census.md`.
      Reviewed Graduate School set: 21 tie answers at >= 4, 13 right; "ask on every tie" loses 13 right to fix 6; no cosine margin separates them.
- [x] 1.2 / 1.3 Tie rule: **not adopted** (measured worse; row in `benchmark/NEGATIVE_RESULTS.md`). `decide_tier` unchanged.
- [x] 1.4 Round selector `route/scope.rs` `round_scope`: the user names round N and the top title does not -> the ranked entry with
      s >= 3 whose title names round N answers (`Scope::Pick`); works for undated entries (the music pack). Unit tests
      `crates/reflex-wasm/tests/round_pick.rs` (4). Rejected on the way: "ปริญญาโท" on the round-5 keyword line (took the master list away
      from "ปริญญาโทดนตรีบำบัดมีไหม"); the year rule's window (s >= top - 2) was too narrow for 6 vs 3.
- [x] 1.5 No golden changed: `cargo test -p reflex-wasm` green, `route_golden.mjs --check` 2268 / 0 differences, `route_rust_check.mjs`
      2221 / 0 differ, every `tests/*.test.mjs` green, clippy clean. Wasm rebuilt.
- [x] 1.6 `packs/music-college/expected.json` (new; the test and the bench read it): 26 right answers, 5 declines, `known_wrong` empty.
      Probe of the 24 questions: 19 right, 0 wrong, 4 correctly declined, 1 missed (jazz, phase 2).
Done: the music questions have no wrong answer; Graduate School goldens byte-identical.

## Phase 2 - "is there a major X" (branch `feature/body-terms`)
- [x] 2.1 Where X sits: in the music pack the majors are only in the bodies (`ชื่อ: a, b, c`); "แจ๊ส" in one list (bachelor), "Jazz" in
      four. Graduate School: the step fires on none of the 2268 golden questions (goldens identical).
- [x] 2.2 `route/body_terms.rs` + `verdict.rs` `body_list_verdict`: only after the search escalates and only for an existence question
      (new vocab key `exists_q`), the longest list name in the question picks the entries that list it: 1 -> kb_act, 2-3 -> disambiguate,
      more -> no change. Tests `crates/reflex-wasm/tests/body_terms.rs` (5); 3 questions added to `packs/music-college/expected.json`.
- [ ] 2.3 Thai names next to the English major names are data, not code: add them only from a page that prints them (none found yet).
Done when: "มีสาขาแจ๊สไหม" answers the bachelor list (or offers bachelor / master / doctoral, which all have Jazz). Done 2026-11-14.
Wasm size (2026-11-14, `wasm-opt -Oz`): HEAD 594 KB -> 629 KB with the Phase 1-3 work. The vocab overlay first cost +71 KB; sending the
default through the same `from_value` as a pack (one `Deserialize` instantiation) took back 37 KB. A text round trip (`to_string` +
`from_str`) was 3 KB worse and was not kept.

## Phase 3 - a pack's own vocabulary (plan 011 rest)
Corrected 2026-11-14: plan 011 steps 1-5 part 1 are already shipped (f273283, 97aaa73, 842da00, c73b199, 218c0ce): the patterns are in
`packs/graduate-school/vocab.json`, `Router::new(kb, prog, vocab)` takes a pack's vocab, the page passes `agency.json` `vocab`. What is left:
- [x] 3.1 Partial vocab: `route/vocab.rs` `parse` lays a pack's keys over the embedded default (`overlay`): unknown key = error with its
      path, missing key = default, a pattern / string / list is replaced whole (`src` without `flags` is an error). Tests
      `crates/reflex-wasm/tests/vocab_overlay.rs`; goldens identical.
- [x] 3.2 `vocab::check` compiles every pattern of the merged vocab (non-panicking `re::try_compile`; `resolve.lead` through the engine's
      own lookahead rewrite `resolve::patterns::lead_src`) and names the bad key. `Router::new` uses it, so a bad pack fails at load, not
      mid-chat; wasm export `vocab_check`; `scripts/new_agency.mjs` runs it on `agency.json` `vocab`. 3 new checks in
      `tests/agency_pack.test.mjs` (partial builds, unknown key fails, bad regex fails).
- [~] 3.3 Music vocabulary in `packs/music-college/agency.json`, only keys that change something measured on `expected.json` / `questions.txt`.
      2026-11-14: nothing to add yet. All 29 answers and 5 declines of `expected.json` pass on the default vocab, so no key has a measured
      effect. Revisit when the College's real questions arrive (gated on the College).
- [~] 3.4 `docs/adopt.md` step 3: how to write `vocab` (done); the music pack as the worked example waits for 3.3.
- [x] 3.5 Plan 011 step 5 rest: remove the page's own regex copies. 2026-11-14: `?route=js`, `_ISSUE_CATS` and `_STUCK_W` were already gone
      (plan 015). The last decision copy was the not-found path's own loose resolver (`resolveProgramme`, `nearSpelling`, `_P_CORE_DROP`,
      a second `WASM.Resolver`); its result now comes with the router's decision (`route/detail.rs`: `programme` on `unsure_programme` =
      `route/near.rs` `near_programmes`, the same function the route uses; on `tuition_finder_nomatch` = the loose resolution). Scripts that
      used the page's `resolveProgramme` as their way into the resolver use `RESOLVE_SHIM` (`scripts/lib/chatbot_fns.mjs`). Test:
      `crates/reflex-wasm/tests/near_detail.rs`. Left on purpose: view presets that cannot change a route (`finderInit` level / open / intl
      chips via `_P_LEVEL`, `_P_SCHED_PICK` which schedule rows a card leads with, `_AREAS` career chips). They act only on the Graduate
      School catalogue views; a pack without `programmes.json` never reaches them.
Done when: a pack changes how questions are understood by listing only the words it changes, and the Graduate School goldens are identical.

## Phase 4 - tools for any agency's content owner (no backend)
- [x] 4.1 Review page `review.html` built by `new_agency.mjs --draft`: every entry with its question-style title, answer, source link,
      valid_to and status; "approve" ticks produce a patch file (or the edited `.md` set) to commit. Static, nothing leaves the browser.
      Done 2026-11-14: new crate `crates/pack-tools` (bin `pack-review`; modules `entry` (frontmatter, same grammar as
      `build_knowledge_index.py`), `dates` (no date crate), `patch` (one `git apply` file diff per entry: approval_status -> "approved",
      3 lines of context), `review` (page)). `new_agency.mjs --draft` writes `<out>/review.html`; a publish build never does. Page CSP
      `default-src 'none'; connect-src 'none'`, no inline handlers, content escaped, only http(s) sources become links; expired /
      ending-within-7-days `valid_to` is flagged. Tests: `crates/pack-tools/tests/review.rs` (6, incl. `git apply --check` of all music
      drafts), `tests/music_pack.test.mjs` +4 checks; CI runs `cargo test -p pack-tools`. Checked in headless Chrome: "select all" ->
      15 hunks, `git apply --check` clean. `entry` + `dates` are the base for 4.2 (expiry) and 4.4 (lint).
- [x] 4.2 Expiry report: `node scripts/pack_expiry.mjs <pack>` lists entries past `valid_to` and those within 7 days; CI warns (not fails).
      Done 2026-11-14 in Rust (owner rule: new tools in Rust), not a Node script: `cargo run -q -p pack-tools --bin pack-expiry -- <pack|knowledge-dir>...
      [--github] [--today YYYY-MM-DD] [--soon-days N]`; also lists a `valid_to` that is not a real date. CI step in `rust-golden` with
      `--github` (`::warning` annotations, exit 0). Test `crates/pack-tools/tests/expiry.rs`. First run: `music_round_1.md` expired
      2026-11-06 (round 1 is over; the College decides whether to retire it - gated); Graduate School and library-demo have no `valid_to`.
- [x] 4.3 Site watcher for the College (like `programmes-refresh.yml`): a weekly workflow fetches the admission-schedule and the four
      admission pages, extracts dates and majors, and opens a PR naming the entries whose facts changed. Plain fetch, no bot-check bypass;
      a page that refuses is reported, not worked around.
      Done 2026-11-14 in Rust: `crates/pack-tools/src/{facts,watch}.rs`, bin `pack-watch <pack> [--report f] [--save d | --pages d]
      [--today D]`; `.github/workflows/site-watch.yml` (Mondays 01:30 UTC, matrix `pack: [music-college]`). Watches every page the pack
      cites (7 for music, not only the 5 named here). Facts: full dates in Thai or English, BE or CE, incl. ranges ("19-25 Dec. 2026" ==
      "19–25 ธ.ค. 2569"), and the English names entries put in parentheses (majors). Per page: entry dates/names the page does not show,
      and dates from today on that no entry of the pack has. The report has no run date and is committed as
      `packs/music-college/site_watch.md`; the workflow opens a PR only when it differs, so a standing gap is reported once. curl, 1 s
      apart; a refusal is listed, not retried another way. Tests `crates/pack-tools/tests/{facts,watch}.rs` (8). Baseline (live
      2026-11-14): the schedule page matches all 4 round entries; one gap - "Bachelor of Music" (in `music_bachelor_majors.md`) is not on
      /academic/admission-bachelor/ (College to confirm the English degree name; plan 018).
- [x] 4.4 Pack lint in `new_agency.mjs`: duplicate titles, titles sharing most words (the dilution found in 018), empty keyword lines,
      dates in the answer that disagree with `valid_to`.
      Done 2026-11-14 in Rust: `crates/pack-tools/src/lint.rs`, bin `pack-lint <pack|knowledge-dir>... [--github]`; `new_agency.mjs`
      runs it on every build and prints warnings (never fails). Titles: exact duplicate after removing spaces/punctuation, or character
      bigram Dice >= 0.8 - except a series (same words in the same places but one, numbers ignored: round 1/2, ภาคต้น/ภาคปลาย,
      ปริญญาตรี/โท/เอก). Dates: Thai "D <month> YYYY" (BE or CE) in the answer later than `valid_to`. Also empty answer, no source_url.
      CI step `--github` (warnings). Test `crates/pack-tools/tests/lint.rs` (4; music pack must stay clean).
      Found on first run (not ours to change; approved content): `submissions/ui/knowledge-public/suspend_general.md` and
      `transcript_general.md` are the same MAP-C certificate-address question twice (82% alike, same answer). Graduate School owner
      to retire one with `supersedes`. Music pack and library-demo: 0 warnings.
Done when: an owner can review and approve a pack in a browser, and a changed schedule on the website becomes a PR. (Met 2026-11-14,
branch `feature/music-college-pack`; CI/workflow run still to be seen after push.)

## Phase 5 - more College content (drafts only; approval stays gated)
- [~] 5.1 Read and draft from: /academic/scholarships/, /academic-calendar/, /on-stage-events/, /mei, the per-major audition pages
      (/academic/admission-bachelor-<major>/ x 9, master, doctoral), the admission handbooks (Google Drive links: only if they open
      without sign-in).
      2026-11-14: drafted `music_scholarships`, `music_calendar_2570`, `music_registration_2570` (academic_year 2570, valid_to = the
      last date in each). pack-lint 0 warnings; music_pack 42 right answers (was 29); adoption_smoke both sites pass; the golden diff
      (18 questions) is only new answers plus 2 wrong answers fixed (scholarship asks got the round-5 entry) and "สมัครรอบ 5" now
      offering rounds 1-3. Found: the search keeps เมื่อไร / วันไหน in the query (not in QUERY_FILLERS), so an entry needs the
      question-shaped words on its keyword line; changing the fillers would move the Graduate School goldens (not done).
      Then: 9 per-major entries `music_bachelor_<major>` (exam parts, TIME subjects, tuition, notes; source = that major's page) and
      `music_time_scores`, generated from the fetched text (tuition numbers parsed, not retyped). Found on the College's site: 3 tuition
      rows whose 4 years do not add up to the total (README, entries flag them); no currency or year stated.
      pack-watch now reads 18 pages, 1 differs (the old "Bachelor of Music" note); it found 10 calendar dates the entries lacked, half
      of them a pack-watch gap: a spaced range "10 – 14 เม.ย. 2571" read only its end; `facts::dates_in` now reads both (test added).
      59 right answers; known wrong: English "tuition fee" (shortest keyword line wins a 9-way near-tie: an engine-side fix would be
      to offer picks when 3+ entries tie on the matched words), "ค่าเทอมปริญญาโทเท่าไร" (pre-existing; fixed by `music_master_fees`, below).
      Then `music_master_fees` (all 11 master pages read; MM and MA tables, all sums check). Split into MM / MA it lost bare
      "ปริญญาโท" and generic fee asks to whichever had the shorter keyword string, so one entry. 63 right answers, golden 173.
      Corrected on the way: the README said no page lists Music Therapy (it is a Master of Arts major); Thai search words on
      `music_master_majors` now reach it. adoption_smoke's English decline probe was "master programme tuition" (a Graduate School
      topic only for an agency without masters): now a thesis/Turnitin question.
      Not drafted: /on-stage-events/ (concert listings, they expire within weeks), /mei (covered by music_bachelor_majors), the
      handbooks on Google Drive (not opened), master / doctoral audition details.
      Then the 7 doctoral pages: `music_doctoral_fees` (DM 4 years, PhD 3 years + work-site fee, sums check) and
      `music_grad_english` (the graduate English score table). 68 right answers, golden 182. "มีสาขาแจ๊สไหม" now offers bachelor /
      doctoral / pre-college (near-tie); recorded in the new `pick` section of expected.json (music_pack test, golden pool and
      tie_census read it). Pre-college: the 6 major pages publish no tuition (the entry says so). Next: master audition pages (done 2026-11-14: `music_master_auditions_en`, the 11 major pages, 95 right answers, golden 227; the per-instrument piece lists stay on the pages).
      Then `music_bachelor_fees` (the 9 majors' stated totals): "ค่าเทอมปริญญาตรี" got the doctoral fees. 77 right answers, golden 195.
      Needed "วันไหน" on the 4 round keyword lines (round 2 fell below the 0.20 cosine step) and "ป.ตรี" on music_bachelor_majors.
      Open (engine): English "tuition fee" ties bachelor / master / doctoral fees at score 4 and the low-gate rule in
      decide/tier.rs acts on the first. Skipping that rule on a top tie offers the 3 (right) but moves 138/2221 Graduate School
      routes and 142/2177 LINE decisions; needs a review of those rows before it can land.
      2026-11-14 review done: re-run as "a tie (lead < 1) skips the low-gate act", 135 Graduate School rows become pick lists, and
      nearly all are worse: 44 are year / term registration schedules (the scope guard asks the year / term better), 55 tie
      near-duplicate answers (Dice >= 0.6), the rest tie unrelated entries (suspend / transcript, contact_line / scholarship_types).
      Not landed. Landed instead: `level_tie` (`route/scope.rs`, called in `route/verdict.rs`): a top tie in one category whose two
      titles name different degree levels, with no level in the question, offers the entries. "tuition fee" now offers the
      doctoral / bachelor / master fees (`pick` in expected.json); Graduate School 2221/2221, LINE golden and library-demo unchanged.
      Census re-run: `benchmark/tie/002_2026-11-13_tie_census.md` ("ask on every tie" would cost the music pack 6 right answers).
- [~] 5.2 English entries from the English pages (the site's main language), `language: "en"`, for international applicants.
      2026-11-14: `music_international_apply` (/academic/admission-international/: COMMAS or a yearly audition in Southeast Asia,
      the ISSC email). The build now reads a `คำค้นภาษาไทย:` keyword line (it read only `คำค้นภาษาอังกฤษ:`). 73 right answers,
      golden 190. Open: English versions of the round/fee entries (the English pages would need reading per major).
      Then `music_rounds_2570_en` (/en/admission-schedule/, rounds 2-4, same dates as the Thai entries): 81 right answers, golden 203.
      pack-lint now warns on a second `คำค้น…:` line (the build reads only the first). Open: English fee entries (per major page).
      Then `music_bachelor_fees_en` (the 9 English major pages, Year 1-4 + total, same figures as the Thai entries): 84 right
      answers, golden 208. Bare "tuition fee" now gets the bachelor summary (still a score-4 tie; 5.1 engine note stands).
      Then `music_master_fees_en` / `music_doctoral_fees_en` (all 18 graduate major pages re-read, same figures): 89 right answers,
      golden 217. Found on the way: one `##` section serves only its FIRST paragraph (`extract_answer`); 29 music entries lost their
      dates / exam parts / fee tables. Bodies joined to one paragraph; pack-lint `UnservedParagraphs` (`pack-tools/src/answer.rs`);
      `round_scope` keeps a top whose answer names the asked round ("เทคโนโลยีดนตรีมีรอบ 5 ไหม"). "how much is the PhD"
      (bachelor English fees) was wrong: the search scores letter triples, "how much is the" outweighs "PhD"; a keyword fix
      traded it for "PhD tuition" (reverted). Fixed by `level_scope` (`route/scope.rs`, test `tests/level_pick.rs`): a named degree
      level picks the same-category entry whose title names it when the top hit says nothing about it, from score 3 up ("how much
      is the master" tops at 3); 91 right answers, golden 219, Graduate School 2221/2221 and LINE unchanged.
      Then review.html marks what the chat drops (`answer::lost_paragraphs`, the same rules as pack-lint), and `answer.rs` now also
      mirrors the builder's `ANSWER_CAP` (1500 chars, cut at a section boundary): pack-lint `CappedSections`. Checked against the
      builder itself on all 132 public entries: the same 26 single-section entries and 7 capped ones (gm_registration_2569 loses
      31 paragraphs; the other 6 lose the evidence-scope note).
      Gated on the Graduate School owners: 26 public entries (`submissions/ui/knowledge-public/gm_*`; earlier counted as 28, wrong) lose later paragraphs too, plus the 7 capped ones,
      some student-facing (gm_forms_directory serves 1 of its 5 form names; gm_application_fee drops the payment channels and the
      several-programmes rule); fixing them changes served answers that are pending owner approval. CI's pack-lint now lists them.
- [~] 5.3 Extend `packs/music-college/questions.txt` per new topic; `tests/music_pack.test.mjs` gets each new right answer.
      2026-11-14: 14 questions for the 13 new entries; expected.json 29 -> 59 answers, "มีทุนไหม" and "ค่าเทอมเท่าไร" off the no-data list,
      "กู้ กยศ ได้ไหม" known_wrong.
Done when: every topic the College's public site covers has a draft entry with its source.

## Phase 6 - the platform side
- [x] 6.1 `adoption_smoke.mjs` in CI (Chrome on ubuntu runners) for `examples/library-demo` and `packs/music-college --draft`.
      2026-11-14: new `adoption` job in `ci.yml` (Rust + Node 24; `tests/agency_pack` and `tests/music_pack`, which CI did not run
      before; then the smoke on both sites with `CHROME=/usr/bin/google-chrome`; AppArmor userns sysctl for Chrome's sandbox).
      Local: both sites 17/17. First push (run 43522376379) failed: the adoption job never built the published index that
      `scripts/lib/rust_route.mjs` reads at import; the job now builds it first (9415ff4). Green on a runner: run 43523345830
      (test, adoption, rust-golden all success), branch feature/music-college-pack, not merged into main yet.
- [x] 6.2 LINE worker reads a pack (plan 009 C4 left it on the Graduate School copy `kb-data.mjs`): `integrations/line-worker` builds
      its KB from a pack dir; one test per pack like `tests/line_route.test.mjs`. No new LINE account is connected (that is gated).
      2026-11-14: `line_core.mjs` `makeLine(kb, Router)` is the decision (worker.mjs uses it; line_route 5/5, line_kb_eval unchanged).
      `pack-line-kb <index> <out.mjs> [--agency agency.json] [--check]` (crates/pack-tools, Rust) writes `KB` byte for byte as
      gen_line_kb.mjs (test against kb-data.mjs) plus `LINE_VOICE` {persona, examples}; a --draft index gets a DRAFT header.
      Found and fixed: LINE small talk, restart, overview and the not-a-question hint spoke as the Graduate School for any manual
      (smalltalk.mjs had its lines fixed); now `ctx.voice` from agency.json, neutral lines for keys left out (as the page does).
      `tests/line_pack.test.mjs` (library demo + music draft, 16/16; dropping the voice fails it) runs in CI's `adoption` job.
      Still Graduate School for any agency (for 6.4/6.5 config, not changed here; the proxy is deployed): the LLM proxy's system
      prompts and query-rewrite prompt (`integrations/llm-proxy/worker.mjs` REWRITE_SYS, the grounded system lines), its single
      ALLOWED_ORIGIN, the Ollama system line in `_shared/team-adapter.mjs`, and the worker's fixed KERNEL / LLM_PROXY URLs.
      The page had the same leak (VOICE.overviewLead listed "ส่งวิทยานิพนธ์" for every agency): topics split into overviewTopics, shown
      only when AGENCY.builtinKb (the Graduate School); pages-csp regenerated; all tests/*.test.mjs pass, adoption_smoke 17/17 on both sites.
- [x] 6.3 Per-pack goldens `benchmark/golden/<agency>/` recorded from the pack's own manual (plan 011 target shape).
      2026-11-14: `pack-golden <pack> <site> <golden.json> [--write --today D]` (crates/pack-tools, Rust; reflex-wasm as a native dep)
      decides each question with `route::router::decide` in an adopted site's state (no catalogue, AI off, IT only if agency.json has
      `it`, the pack's vocab installed). Pool = the pack's examples + questions.txt + expected.json + entry titles + first 3 keywords,
      then 48 shared probes. Recorded: library-demo 63 cases, college-of-music (draft) 109, then 173, 182, 190, 195, 203, 208, 216, 217, 218, 219, 227 after 5.1 / 5.2; check = 0 differences. No browser: every
      route except not_found is in decide_route now, so the native decision is the page's. Second reader: tests/pack_golden.test.mjs
      (the shipped wasm on the same files, plus no foreign entry id), 4/4. Negative controls: retitling music_round_2 -> 9 differences,
      exit 1; one tampered golden entry -> the wasm test fails. CI `adoption` job runs both. Tests: crates/pack-tools/tests/golden.rs (5).
      Seen in the music golden (recorded as is, not changed here): "กำหนดการสมัคร" and "สมัครรอบ 5" are not_found although the pack has
      round entries; "เข้าระบบไม่ได้" goes to intake on sites with no IT contact.
- [x] 6.4 One command for a new agency: `node scripts/new_agency.mjs <pack> <out> --with-line --with-kernel` writes the site plus the
      worker configs (wrangler files with placeholders, never real IDs), and prints what the owner must still fill in.
      2026-11-14: the LINE worker is `integrations/line-worker/app.mjs` `makeWorker(manual)`; `worker.mjs` is the Graduate School's
      3-line entry (wrangler dry-run bundle unchanged, 1041 KiB). KERNEL_URL / LLM_PROXY / SITE_ORIGIN come from [vars], the old
      constants are the defaults. `pack-workers` (crates/pack-tools, Rust) writes `<out>.workers/line/{worker.mjs,kb-data.mjs,
      wrangler.toml}` beside the site (never inside the published folder); 5 `REPLACE_` placeholders printed. Both generated workers
      bundle with `wrangler deploy --dry-run` (library demo: line 708 KiB, kernel 281 KiB, D1 `reflexwork-library-demo`).
      tests: crates/pack-tools/tests/workers.rs (4), tests/line_pack.test.mjs 24/24 (no Graduate School D1 id / host / site / service
      name in any config; the generated entry answers /health). docs/adopt.md step 6.
- [x] 6.5 Kernel worker per agency (gap log, votes) as config only, D1 name per agency; documented, not deployed.
      2026-11-14: `--with-kernel` -> `<out>.workers/kernel/wrangler.toml` (main = the shared kernel worker, D1 `reflexwork-<id>`,
      database_id placeholder, LLM_PROXY_SVC binding commented out: no auto-draft until the agency has a proxy). The kernel's CORS
      origin was a constant: now [vars] SITE_ORIGIN (default unchanged). Tables are created by the worker itself (CREATE IF NOT EXISTS).
      Open, gated on the agency: its own LLM proxy (prompts still name the Graduate School, see 6.2), hosts, LINE channel.
Done when: a second agency gets site + LINE + kernel configs from one pack, with its own tests in CI.

## Phase 7 - hygiene that is ours to do
- [~] 7.1 The 9-day-old programme catalogue: `gh workflow run programmes-refresh.yml`, review the PR (deploy asked separately).
      2026-11-14: run 43524235144 green (the 2026-11-09 scheduled run had failed on a link-rot timeout to the Graduate School
      site). The workflow pushed `bot/programmes-20261113` but could not open the PR (repo setting "Allow GitHub Actions to create
      and approve pull requests" is off); opened by hand as PR #152. Changes: 3 programme codes replaced by a new revision (same
      titles), 13 announcements appeared, 4 statuses closed -> open, 2 fee tables. Follow-ups in the PR: the route / LINE golden
      probe `สมัคร 2101D04G` -> `2101D05G`, page claims 239 -> 253 announced and 1,923 -> 1,931 names. PR CI: rust-golden green,
      test red only on G05 (`a11y_chat`, already red on main; fixed on this branch). Open: merge #152 (yours), then deploy (asked
      separately); the repo setting, if the weekly run should open its own PR.
- [ ] 7.2 The untracked files at the repo root and `integrations/kernel-worker/` (list with sizes; ask keep/delete in one question).
- [x] 7.3 `docs/adopt.md` "not done yet" section: update after phases 3 and 6 (second real agency now exists, as a draft).
      2026-11-14: the status line and the first "not done" item name the College draft (28 entries, none approved, dev-written questions).
      Re-read it when the College approves entries or sends real questions.

## Not in this plan (gated)
College: approvals, Thai name, admissions email, fees, IT contact, real questions, hosting, LINE account, PDPA. Graduate School: data-rights
email. University: DPO sign-off (O5), reviewed questions. Owner: data-platform PDF, Cloudflare plan of the LINE worker, plan 009 D.
