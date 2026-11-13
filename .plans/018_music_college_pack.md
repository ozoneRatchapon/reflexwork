# 018 - Second real agency: College of Music, Mahidol (2026-11-13)

The owner is moving to the College of Music (https://www.music.mahidol.ac.th). Goal: the College gets its own chat site from a pack,
with no code change of the engine. Pack: `packs/music-college/` (see its README for content, sources and open questions).

## Done (2026-11-13)
- [x] Pack with 14 draft entries from the public site, re-read from the live pages; agency.json (contact, LINE).
- [x] `scripts/new_agency.mjs --draft`: preview a pack before approval; without it the build still refuses unapproved entries.
- [x] `scripts/adoption_smoke.mjs`: the leak check flagged every `mahidol` link, so a Mahidol unit always failed. Now a Mahidol link is a
      leak only if its host is not the agency's own; Graduate School words and graduate.mahidol stay leaks. Music and library-demo pass.
- [x] `scripts/coverage_probe.mjs --questions <file>`: probe another agency's question list.
- [x] Probe: 17/24 answered; doctoral was answered with the bachelor majors until the doctoral entry was added.

## Done (2026-11-14)
- [x] CI on `main` was red since the O4 merge `db6afad` (12 Nov): `tests/a11y_chat.test.mjs` matched NEUTRAL_AGENCY's keys in one order and
      O4 added `privacy:null` between them. The check is now order-free (contact, it, line must be null). All tests/*.test.mjs pass locally.
- [x] Round keywords (ประกาศผล รายงานตัว) and a location entry: 19/24 answered, 1 wrong (README).
- [x] `tests/music_pack.test.mjs`: draft build, publish build refuses unapproved, own-site sources, 19 answers, 5 declines.

## Next (ungated)
- [x] "ปริญญาโทมีรอบ 5 ไหม" -> master majors: not a tie (6 vs 3, see `benchmark/tie/001_2026-11-13_tie_census.md`). Fixed by the round
      selector (plan 019 step 1.4); no data change, no golden changed. Probe: 19 right, 0 wrong, 4 declined, 1 missed.
- [x] "มีสาขา X ไหม" misses: fixed by the body-list lookup (plan 019 phase 2, 2026-11-14).
- [~] adoption_smoke (needs Chrome) on the music pack in CI: `adoption` job added 2026-11-14 (plan 019 6.1); first runner result pending a push.

## Gated (the College)
- [ ] Entry approval, Thai formal name, admissions email, fees/scholarships, IT contact, real questions (pack README, "Needs the College").
- [ ] Hosting and PDPA review before any kernel/AI backend for the College (default: none; nothing leaves the browser).
- [ ] English degree name: `music_bachelor_majors.md` says "(Bachelor of Music)", which /academic/admission-bachelor/ does not show
      (first `pack-watch` run, 2026-11-14, `site_watch.md`). The College confirms the name or a page that states it.
- [ ] `music_round_1.md` is past its `valid_to` (2026-11-06; `pack-expiry`): the College decides whether to retire it or keep it as history.
- [ ] Owner review: `node scripts/new_agency.mjs packs/music-college /tmp/mus --draft` then open `/tmp/mus/review.html` (plan 019 4.1).
