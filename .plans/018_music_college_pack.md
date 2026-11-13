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

## Next (ungated)
- [ ] The 3 misses with data present (results / registration per round, "มีสาขา X ไหม"): fix in the engine (round + aspect words), not by
      stuffing keywords. Needs plan 011 step 1 (vocab out of the Rust patterns) for music words.
- [ ] A CI check that builds `packs/music-college --draft` and runs adoption_smoke (like the library demo).

## Gated (the College)
- [ ] Entry approval, Thai formal name, admissions email, fees/scholarships, IT contact, real questions (pack README, "Needs the College").
- [ ] Hosting and PDPA review before any kernel/AI backend for the College (default: none; nothing leaves the browser).
