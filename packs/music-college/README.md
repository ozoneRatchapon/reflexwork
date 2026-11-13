# College of Music, Mahidol University: data pack (DRAFT, not approved)

The second real agency for ReflexWork (plan 018). Built 2026-11-13 from the College's public website only.
**Every entry is `approval_status: "draft"`**: a normal build publishes nothing until a College owner approves each entry.

## Build and check
```
node scripts/new_agency.mjs packs/music-college /tmp/mus-site --draft     # preview only; without --draft the build refuses (0 approved)
node scripts/adoption_smoke.mjs /tmp/mus-site                              # all 16 checks pass (2026-11-13)
cd /tmp/mus-site && python3 -m http.server 8765 &
node scripts/coverage_probe.mjs --url http://127.0.0.1:8765/chatbot.html --questions packs/music-college/questions.txt --no-write
```

## What is in it (14 entries; facts re-read from the live pages 2026-11-13)
| entries | source |
|---|---|
| admission rounds 1-4 of AY 2570 (deadline, audition, interview, results, registration; `valid_to` = last registration day), round overview, on-site audition, graduate round 5 note | /admission-schedule/ |
| how to apply (COMMAS steps) | /academic/admission-bachelor/ (same text on the master and pre-college pages) |
| majors: bachelor (9 + MEI), master (11), doctoral (7), pre-college (6) | /academic/admission-bachelor/, -master/, -doctoral/, -pre-college/ |
| admissions and general contact, address | /admission-schedule/, /contact-us/ |
| privacy notice | /privacy-policy/ |

## Probe (24 dev-written questions, not real users): 17 answered from the pack, 7 not understood
- Correctly not answered (no data on the website): tuition, application fee, scholarships, practice-room booking.
- Missed although the data is there: "ประกาศผลรอบ 3 เมื่อไร", "รายงานตัวรอบ 2 วันไหน", "มีสาขาแจ๊สไหม".
  Longer titles or keyword lists made it worse (round questions became "which one?", the bachelor entry stopped matching), so they were reverted.
- The engine still carries Graduate School vocabulary (plan 011 step 1, not started); music words (audition, major names) are not in it.

## Needs the College (cannot be done from the website)
1. An owner who reads and approves each entry (sets `approval_status: "approved"`).
2. The Thai formal name: "วิทยาลัยดุริยางคศิลป์ มหาวิทยาลัยมหิดล" is used; the website does not show it.
3. The admissions email: /contact-us/ shows `msadmission@mahidol.edu` as text but links `msacadmc@mahidol.ac.th`; the pack uses `msadmission@mahidol.ac.th` (from /admission-schedule/).
4. Tuition, application fee, scholarships, office hours, IT/COMMAS support contact: not on the pages read.
5. The LINE account `@cjo1559e` is taken from the site's link; confirm it is staffed for questions.
6. Real questions from applicants/students (replace `questions.txt`).
7. Is a graduate applicant handled by the College only, or also by the Graduate School? Not stated on the pages read.
