# 004 — Idea: public tier vs signed-in (personal) tier

Owner's idea (2026-11-04): the chatbot suits prospects and the general public as is; a person with an account could get deeper, more relevant personal detail.

## Shape
- Public tier: manual + public programme data, anonymous. Current work (plan 003).
- Personal tier: needs (1) sign-in with the university account, (2) a personal data source the registrar agrees to expose (unknown whether an API exists), (3) PDPA decisions (what is stored, how long).

## Blockers to clear first (from plan 003 findings)
- Intake text with name / student id / email is posted raw to the public /gap log, twice (findings 66, 43).
- Pages claim "no data leaves the device" (finding 44).
- ?api= / ?llm= accept any origin (finding 10); kernel endpoints open (finding 32).

## Open questions for the owner
- Does the registrar / IT offer an API or SSO we may use?
- Which personal facts matter most (request status, schedule, deadlines)?

## 2026-11-06 update
- Done (page only, no sign-in): **personal-question boundary** - a question that asks for ONE person's record ('ผลสอบของฉันออกหรือยัง', 'ค่าเทอมที่ผมค้างจ่ายเท่าไร', a friend's record or a student id) gets 'cannot see personal data' + why + the staff contact (+ e-Thesis for thesis questions), never a general entry that reads like their answer, never logged, never calls the AI. How-to / eligibility questions are untouched (0 of 1,490 known questions diverted). tests/personal_boundary.test.mjs + e2e. Before this, 3 of 7 probe questions got a plausible but unrelated general entry. LINE worker not changed.
- Decided NOT to build a mock sign-in for the pitch (no data source, the pitch says concept only, open server-side holes F33).
- Tier model to propose (concept): anonymous = public + boundary; student = own record only, friend's record always refused (delegation only by the friend's in-app consent); programme staff = own programme, read-only, aggregates before individuals, audit every query. Authorisation server-side, never by the chat model; typed identity ('I am staff') never counts; the LLM never sees personal data.
- Still blocked on the owner: SSO / API from registrar or IT, PDPA decisions, closing F33.
