# 014 - Learning chatbot: learn public sources together with the owner, keep a checked log (2026-11-08)

Goal: a chatbot that answers questions about public project material (katgpt-rs, reflex, rethink, refine, riir, and the CQL / FHIR
material from the hospital-side lectures), and a learning log that both sides can check. Learning is done in the open, one claim at a time.

## Ground rules
1. Sources are public and citable: a URL, a repo path with commit hash, or a published document. Lecture slides and live recordings count
   only with the owner's permission to reuse them; until then they are notes for the owner, not KB entries.
2. Every learned claim gets one log entry: `claim`, `source` (URL or repo path + commit), `how checked` (read the file / ran the code /
   owner confirmed), `confidence` (high / medium / low), `date`. A claim with no source is not logged as learned.
3. Nothing from the log goes into the chatbot KB until the owner confirms it.
4. Negative results go in the log too (what was tried and failed, with the number), so they are not repeated.
5. The FHIR sandbox and other live servers: read-only checks (metadata, counts) are allowed for learning. No patient-like data is copied
   into the log, the KB or any prompt (plan 011 health-data rule).
6. Licence check before reuse: a repo with no licence (for example DBCG/cql_runner) is read and cited, not copied.

## Log location
`.learning/` (one file per topic, numbered, e.g. `001_katgpt_best_belief.md`). Each file starts with a Verdict line.

## Steps
1. Pick the first topic with the owner (suggestion: katgpt-rs best_belief, which is already measured in plan 010).
2. For each claim: read the source, write the log entry, and ask the owner to confirm the high-impact ones.
3. Quiz the chatbot on the logged claims with a held-out question set the owner writes. Report recall of correct, cited answers.
4. Only then add confirmed entries to the KB, through the normal gate set (plan 012).

## Hospital-side context (from the owner's screenshots, 2026-11-08)
- A public HAPI FHIR R4 sandbox (cloud.alphora.com) with resource counts shown on the page (Patient 124, Observation 83, MedicationRequest 57).
  Counts are a snapshot of the sandbox; they are not verified here and must be re-read before use.
- CQL IDE and the CQL specification tab: the public reference for CQL (cql.hl7.org).
- A lab row (LBXGLU, fasting glucose, 63-405 mg/dL). The code looks like an NHANES variable name; this is not verified and is logged as a question.

## Open questions for the owner
- Which first topic (see step 1).
- Whether the lecture material (live class, slides) may be used as KB sources, and by whom.
- Who writes the held-out questions and the expected answers.

## Decision (2026-11-08)
- Start with katgpt-rs (`.learning/001_katgpt_best_belief.md` is the first entry).
- Hospital-side lecture slides and screenshots are NOT part of this chatbot. They are kept as a separate case for another domain's
  work (a different organisation's topic), not as KB or learning-log input here.
