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
