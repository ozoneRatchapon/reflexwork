# College of Music, Mahidol University: data pack (DRAFT, not approved)

The second real agency for ReflexWork (plan 018). Built 2026-11-13 from the College's public website only.
**Every entry is `approval_status: "draft"`**: a normal build publishes nothing until a College owner approves each entry.

## Build and check
```
node scripts/new_agency.mjs packs/music-college /tmp/mus-site --draft     # preview only; without --draft the build refuses (0 approved)
open /tmp/mus-site/review.html                                             # owner review: paragraphs the chat drops are marked; tick entries, download approve.patch, then `git apply approve.patch` at the repo root
cargo run -q -p pack-tools --bin pack-lint -- packs/music-college      # competing titles, empty keyword lines, answer dates after valid_to (0 warnings 2026-11-14)
cargo run -q -p pack-tools --bin pack-expiry -- packs/music-college    # entries past valid_to / ending within 7 days
cargo run -q -p pack-tools --bin pack-watch -- packs/music-college     # re-read the cited pages; weekly in .github/workflows/site-watch.yml -> site_watch.md
node scripts/adoption_smoke.mjs /tmp/mus-site                              # all 16 checks pass (2026-11-13)
cargo run -q -p pack-tools --bin pack-line-kb -- /tmp/mus-site/knowledge-index.json /tmp/mus-line-kb.mjs --agency packs/music-college/agency.json   # LINE manual + voice (DRAFT header: never deploy)
node tests/line_pack.test.mjs                                              # LINE replies on this pack: only its entries, never the Graduate School (16/16 2026-11-14)
cargo run -q -p pack-tools --bin pack-golden -- packs/music-college /tmp/mus-site benchmark/golden/college-of-music/route.json   # route + entry per question vs this pack's own golden (227 questions, 0 differences 2026-11-14)
cd /tmp/mus-site && python3 -m http.server 8765 &
node scripts/coverage_probe.mjs --url http://127.0.0.1:8765/chatbot.html --questions packs/music-college/questions.txt --no-write
```

## What is in it (38 entries; facts re-read from the live pages 2026-11-13, the last 17 read 2026-11-14)
| entries | source |
|---|---|
| admission rounds 1-4 of AY 2570 (deadline, audition, interview, results, registration; `valid_to` = last registration day), round overview, on-site audition, graduate round 5 note | /admission-schedule/ |
| how to apply (COMMAS steps) | /academic/admission-bachelor/ (same text on the master and pre-college pages) |
| majors: bachelor (9 + MEI), master (11), doctoral (7), pre-college (6) | /academic/admission-bachelor/, -master/, -doctoral/, -pre-college/ |
| admissions and general contact; the address (its own entry) | /admission-schedule/, /contact-us/ |
| privacy notice | /privacy-policy/ |
| scholarships (Prem fund, merit, special instruments, bursaries, ThaiBev, Love Is Music, student loans, exchange); the call dates on the page are 2565 and 2567, so the entry names no open dates | /academic/scholarships/ |
| one entry per bachelor major (9): the entrance exam parts, the TIME subjects, the tuition table per year, notes (Popular Music: Thai only and no round 5; Music Technology and classical Voice: no round 5; classical guitar: in person unless a non-Thai applicant abroad sends a video) | /academic/admission-bachelor-<major>/ |
| master tuition (Master of Music, 7 majors; Master of Arts, 4 majors plus the Music Business special program; Thai and international rates) | the master major pages, linked from /academic/admission-master/ (cited) |
| bachelor tuition summary (the stated 4-year total of each of the 9 majors and their instrument rows; yearly rows stay in each major's entry) | the 9 bachelor major pages, linked from /academic/admission-bachelor/ (cited) |
| bachelor tuition in English (`music_bachelor_fees_en`: every major's Year 1-4 row and stated total, the 3 rows that do not add up named) | the same 9 English major pages (cited: /academic/admission-bachelor/) |
| master and doctoral tuition in English (`music_master_fees_en`, `music_doctoral_fees_en`: the same rows as the Thai entries, checked against all 18 graduate major pages) | the master / doctoral major pages (cited: /academic/admission-master/, /academic/admission-doctoral/) |
| master entrance exam by major in English (`music_master_auditions_en`: the exam parts of each of the 11 majors, figures checked against the raw page text; the piece lists stay on the major pages) | the 11 master major pages, linked from /academic/admission-master/ |
| doctoral tuition (Doctor of Music, 5 majors, 4 years; Doctor of Philosophy, 2 majors, 3 years plus the work-site study fee; Thai and international rates; all sums check) | the 7 doctoral major pages, linked from /academic/admission-doctoral/ (cited) |
| graduate English scores (MU GRAD PLUS, IELTS, TOEFL-iBT, MU ELT: entrance minimum, master pass, doctoral pass; 2-year limit; theory/history placement) | the same table on each doctoral major page (cites /admission-doctor-of-music-classical-performance/) |
| admission rounds 2-4 of AY 2570 in English (`language: "en"`, `valid_to` 2027-04-22; round 1 named as closed; the round 5 date stays in the Thai entry) | /en/admission-schedule/ (same dates as the Thai entries) |
| international applicants (English entry, `language: "en"`: apply on COMMAS or at a yearly audition in Southeast Asia; most majors taught in English; the International Student Service Center email) | /academic/admission-international/ |
| TIME scores (45% interview, 60% pass, 45-59% conditional; subjects per major; where to sit TIME) | the same text on each major page (cites /admission-bachelor-jazz/) |
| academic calendar AY 2570 (semesters, orientation, exams, grade days) and registration AY 2570 (regular per year group, late, add/drop, withdrawal, minor courses), both `academic_year: "2570"`, pre-college and bachelor only | /academic-calendar/ |

## Probe (24 dev-written questions, not real users; 2026-11-14): 20 right, 0 wrong, 4 correctly not answered
- Correctly not answered (no data on the website): tuition, application fee, scholarships, practice-room booking.
- **Fixed 2026-11-14 in the engine**: "มีสาขาแจ๊สไหม" missed (แจ๊ส is only in the bachelor body, not a title or keyword). A question
  whether something exists now looks the name up in the body lists (`ชื่อ: a, b, c`, 3+ items) after the search finds nothing: one entry
  lists it -> that entry; 2-3 -> they are offered (plan 019 phase 2). English "jazz" is in 4 lists, so "มีสาขา jazz ไหม" is still not answered.
- Checked 2026-11-14: Music Therapy is a master major (Master of Arts, /academic/admission-master/). "มีสาขาดนตรีบำบัดไหม" got the pre-college
  majors, then nothing; Thai search words (ดนตรีบำบัด ดนตรีวิทยา การอำนวยเพลง) on the master keyword line now reach the master majors.
- **Fixed 2026-11-14 in the engine**: "ปริญญาโทมีรอบ 5 ไหม" used to get the master majors (the question shares "ปริญญาโทมี" with that
  title, 6 vs 3). A round the user names now picks the ranked entry whose title names it (plan 019 step 1.4).
- What helped: Thai words "ประกาศผล รายงานตัว" on each round's keyword line; the address as its own entry ("วิทยาลัยอยู่ที่ไหน" got the
  audition entry before).
- What made it worse and was reverted: longer titles, "jazz" on the bachelor keywords, "ปริญญาโท" in the round-5 title or keywords.
  A word in two titles counts less, so each fix of one question broke another.
- 2026-11-14, 3 new entries (scholarships, calendar, registration): 13 new right answers, and 2 wrong answers fixed: "ทุนการศึกษามีไหม" /
  "ทุนการศึกษามีอะไรบ้าง" were answered from the graduate round 5 entry ("ศึกษามี" in its title), "ทุนแลกเปลี่ยนต่างประเทศ" from the on-site
  audition entry. Question words help on a keyword line ("เปิดเทอมเมื่อไร", "เกรดออกเมื่อไร"): the search does not strip เมื่อไร / วันไหน, so
  "เปิดเทอมเมื่อไร" alone scored 1. A long keyword line made the scholarship entry lose "ทุนการศึกษามีอะไรบ้าง" again (each word weighs less);
  the shorter title "ทุนการศึกษามีอะไรบ้าง ..." fixed it. Still missed: "กู้ กยศ ได้ไหม" (`known_wrong`). Side effect: "สมัครรอบ 5" now
  offers rounds 1-3 instead of not answering (benchmark/golden/college-of-music/route.json shows every change).
- 2026-11-14, 10 more (9 majors + TIME): 59 right answers in all. Generic "ค่าเทอมเท่าไร" offers the 9 majors (it was in `none`).
  Known wrong, not fixable by keywords: English "tuition fee" gets one major's entry (the one with the shortest keyword line wins a
  9-way near-tie: jazz, then business after "improvisation" was added); "ค่าเทอมปริญญาโทเท่าไร" got the master majors (fixed by `music_master_fees`). Reverted: "audition" on the 9 keyword lines
  (round 4 lost its question), "สาขา" in the 9 titles ("ป.ตรี มีสาขาอะไรบ้าง" lost), longer keyword lines for all 9 (3 new wrong).
- 2026-11-14, master fees: one entry for both degree tables. Two entries (Master of Music / Master of Arts) did not work: whichever had
  the shorter keyword string took bare "ปริญญาโท" and the generic fee questions. Now 63 right answers. Changed on the way: bare
  "ปริญญาโท" gets the master fees (it got the master majors), "tuition fee" gets the master fees (it got a bachelor major), "ติดปัญหา" /
  "ช่วยด้วย" offer the registration area (the stuck chooser finds `music_registration_2570`).
- 2026-11-14, doctoral fees + graduate English scores (7 doctoral pages read): 68 right answers. Changed on the way: "มีสาขาแจ๊สไหม"
  now offers the bachelor / doctoral / pre-college majors (a near-tie after the corpus grew; removing the major names from the fee
  entry did not change it). That is a fair reply (they all list Jazz; the master list is not offered), so it moved to the new
  `pick` section of `expected.json` (the test wants exactly those entries offered). English "tuition fee" now gets the doctoral fees
  (still wrong, same near-tie). Not drafted from those pages: the per-instrument audition requirements (long, and they change per
  intake) and the 2 contact emails (one person's address and one for percussion only).
- 2026-11-14, international applicants + pre-college fees: 73 right answers. The 6 pre-college major pages publish no tuition (only
  "pay the application fee", amount not given); `music_precollege_majors` now says so, so "ค่าเทอมเตรียมอุดมดนตรี" gets an honest
  "not published". Found on the way: the index build read only a `คำค้นภาษาอังกฤษ:` line, so a `คำค้นภาษาไทย:` line (which pack-lint
  accepts) was silently not searched; the build now reads any `คำค้น…:` line (Graduate School index byte-identical; test in
  tests/kb_versioning.test.mjs). The new entry first made the generic "ค่าเทอมเท่าไร" answer from the doctoral fees (cos 0.1500 ->
  0.1515 crossed a score step) and "รายงานตัวรอบ 2 วันไหน" offer rounds 1-3; the doctoral title "ค่าเทอมปริญญาเอก Doctor of Music และ
  Ph.D." (no "เท่าไร") fixed both. "international admission contact email" gets `music_contact_admissions`, which lists the same email.
- 2026-11-14, bachelor tuition summary (`music_bachelor_fees`): 77 right answers. "ค่าเทอมปริญญาตรี" got the doctoral fees (no entry
  named bachelor tuition; the 9 majors each hold one row). Generic "ค่าเทอมเท่าไร" now answers from this summary (it offered the 9
  majors). Fixed on the way: the new entry made "รายงานตัวรอบ 2 วันไหน" fall to score 3 (cos 0.185 < 0.20) and tie rounds 1/3/4;
  "วันไหน" on the 4 round keyword lines lifted it to 4 (the round selector then picks round 2). "ป.ตรี" on the fee keyword line made
  "ป.ตรี มีสาขาอะไรบ้าง" a pick; "ป.ตรี" on the bachelor majors keyword line fixed it. Still wrong: English "tuition fee" gets the
  doctoral fees: bachelor / master / doctoral fees all score 4 and the low-gate rule acts on the first by cosine. Tried: a tie at the
  top skips that rule (would offer the 3 fee entries) - reverted, it changes 138 of 2221 Graduate School routes and 142 of 2177 LINE
  decisions (engine side, open in plan 019 5.1).
- 2026-11-14, English admission rounds (`music_rounds_2570_en`): 81 right answers. "when is the audition", "when are exam results
  announced", "when do I register and pay tuition" got `english_off_corpus` (the Thai round entries tie at score 1); "when is the
  interview" offered rounds 2-4 in Thai. All 4 now get the English entry; "round 2 audition date" / "round 3 deadline" still pick the
  Thai round entry. Found on the way: the build reads only the first `คำค้น…:` line, so a second line (here an English one under a Thai
  one) was ignored; pack-lint now warns about it (`ExtraKeywordLine`; no entry in either pack has two today). Thai "กำหนดการสมัคร" now
  gets `music_rounds_overview` ("กำหนดการสมัคร" on its keyword line; it was not answered).
- 2026-11-14, English bachelor fees (`music_bachelor_fees_en`): 84 right answers. "how much is the tuition" and "tuition fees per year"
  got `english_off_corpus`; "how much does the bachelor cost" offered majors / fees / rounds. All 3 now get the English entry.
  "bachelor tuition fee" / "undergraduate tuition" still get the Thai summary (its English keyword line). Bare "tuition fee" now gets
  the bachelor summary, not the doctoral fees, but it is still a 3-way tie at score 4 (bachelor 0.222, doctoral 0.218, master 0.202):
  not pinned in expected.json (after the next two changes it is back on the doctoral fees). The 4-way round tie ("audition",
  "สมัครรอบ 5", "ตอนนี้เปิดรับสมัครรอบไหน") now offers rounds 4/1/2, not 1/2/3 (the "Year 1-4" rows shift the cosine). Keeping
  "bachelor" or "fee" on the English keyword line sent "bachelor programmes" to a fee entry, so neither is on it; "programme" was
  taken out of its title for the same reason.
- 2026-11-14, **the chat served only the first paragraph of 29 of the 35 entries.** The index builder (`extract_answer`) serves one
  `##` section's FIRST paragraph; these entries had the exam parts, dates and fee tables in later paragraphs (`music_rounds_2570_en`
  served its intro and no dates; each bachelor major entry served its one-line heading). Every body is now one paragraph (single
  line breaks), and the builder serves every line (checked with the builder itself). pack-lint now warns (`UnservedParagraphs`,
  `crates/pack-tools/src/answer.rs`, which mirrors the builder). With the full text served, the round selector saw "ไม่รับรอบ 5" in
  the Music Technology entry: the router now keeps a top hit whose title names no round when its answer names the asked one
  (`route/scope.rs` `round_scope`), so "เทคโนโลยีดนตรีมีรอบ 5 ไหม" keeps the Technology entry (it had flipped to the graduate round-5
  entry when the English fee entries were added) and "round 2 audition date" keeps the English rounds entry. "ปริญญาโทมีรอบ 5 ไหม"
  still gets the round-5 entry (the master list does not name a round). Graduate School goldens and LINE decisions: unchanged.
- 2026-11-14, English master / doctoral fees: 89 right answers, golden 217. "how much is a master's degree", "master's tuition for
  international students", "how much is a doctorate", "PhD tuition" get them; the Thai-entry English lines still win "master tuition
  fee" / "doctoral tuition fee". Not answered right: "how much is the PhD" gets the bachelor English fees ("how much" is on that
  line; putting it on all three made "how much is the tuition" go to the master fees). Why: the search scores letter triples, so "how much is the" matches the bachelor line's "how much" on 5 triples while "PhD" adds 1; "how much" on the doctoral line alone made it a doctoral / bachelor / rounds pick and sent "PhD tuition" to the Thai doctoral entry (reverted). Fixed in the router instead (`route/scope.rs` `level_scope`): when the question names a degree level and the top hit says nothing about it (title, keyword line, answer), the best-ranked same-category entry whose title names the level answers, an English-titled one first for an English question. "how much is the PhD" now gets `music_doctoral_fees_en` and "how much is the master" `music_master_fees_en` (the rule runs from the lowest answering score 3, under the year / round guards' bar of 4): 91 right answers, golden 219; Graduate School goldens (2221) and LINE decisions unchanged. Bare English "tuition fee" (the bachelor / doctoral score-4 tie) now offers the doctoral, bachelor and master fees (`level_tie`: the two tied titles name different degree levels; `pick` in expected.json); an engine-wide "ask on a tie" was reviewed and rejected (135 Graduate School rows, nearly all worse; benchmark/NEGATIVE_RESULTS.md).
- 2026-11-14, master entrance exams (`music_master_auditions_en`, the 11 master major pages): 95 right answers, golden 227. "what is
  the master's entrance exam", "what do I need to prepare for the master audition", "master jazz audition requirements", "musicology
  master exam" get it; no recorded answer changed. One entry with each major's exam parts (audition / written exam / interview,
  the key figures), not the per-instrument piece lists (long, and they change per intake: each line points to the major page).
  Still not answered: "how long is the master guitar audition" (english_off_corpus), "music therapy entrance exam" (offers 3
  bachelor majors); widening the keyword line was not tried (it broke other questions each time before). "มีสาขาแจ๊สไหม" offers the same 3 lists,
  doctoral first.
- `expected.json` holds the right answers, the pick-list answers (`pick`), the declines and any known wrong ones; `tests/music_pack.test.mjs` and the reflex-bench `tie_census` read it.

## Needs the College (cannot be done from the website)
1. An owner who reads and approves each entry (sets `approval_status: "approved"`).
2. The Thai formal name: "วิทยาลัยดุริยางคศิลป์ มหาวิทยาลัยมหิดล" is used; the website does not show it.
3. The admissions email: /contact-us/ shows `msadmission@mahidol.edu` as text but links `msacadmc@mahidol.ac.th`; the pack uses `msadmission@mahidol.ac.th` (from /admission-schedule/).
4. Application fee, office hours, IT/COMMAS support contact: not on the pages read. Tuition: the bachelor, master and doctoral major pages publish it (pre-college: none), with no currency and no academic year; bachelor: 3 rows do not add up (Music Business Thai: 4 years 534,300 vs total 626,100; Music Technology Western strings/winds/voice: 645,300 vs 646,100; Music Technology Thai: 537,000 vs 626,100), the entries say so. Master fees are on the master major pages (`music_master_fees`; "might change according to the Faculty of Graduate Studies"); Doctoral fees are on the 7 doctoral pages (`music_doctoral_fees`, same note); pre-college pages not checked for fees yet. Scholarships: the page lists the funds but its calls are from 2565 / 2567; this year's dates and amounts are not published. The calendar page covers pre-college and bachelor only: graduate dates are not on it.
5. The LINE account `@cjo1559e` is taken from the site's link; confirm it is staffed for questions.
6. Real questions from applicants/students (replace `questions.txt`).
7. Is a graduate applicant handled by the College only, or also by the Graduate School? Not stated on the pages read.
