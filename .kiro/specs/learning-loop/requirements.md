# Requirements — Self-improving KB Learning Loop

> Kiro spec-driven workflow · phase 1/3 (requirements → design → tasks)
> Feature: ReflexWork's learning loop that grows the KB from real usage.

## Problem statement
A FastPath chatbot is only as good as its knowledge base. If the KB is thin,
answers miss, users lose trust, and they go back to contacting staff directly.
The system must turn "what it could not answer" into a measurable, low-effort
pipeline that improves the corpus — without a model retrain and without
auto-publishing unverified content.

## User stories & acceptance criteria (EARS)

### R1 — Record unanswered questions
As a maintainer, I want every question the KB cannot answer to be captured,
so I know what to add.
- WHEN the kernel routes a message to escalate/LLM, THE SYSTEM SHALL record the
  question in a gap log, aggregated by a normalized key with a hit count.
- WHERE the question contains PII (email, phone, student id), THE SYSTEM SHALL
  mask it before storing (store counts/shape, never raw PII).
- THE SYSTEM SHALL expose the backlog ordered by most-asked first.

### R2 — Learn which existing entries are weak
As a maintainer, I want entries that keep disappointing users flagged
automatically.
- WHEN a user submits feedback on a KB-sourced answer, THE SYSTEM SHALL adjust
  that entry's confidence via EMA (👎 toward 0, 👍 toward 1).
- THE SYSTEM SHALL expose entries ordered by lowest confidence first.

### R3 — Draft candidate answers (human-approved)
As a maintainer, I want candidate KB entries proposed from gaps and staff
replies, and to approve them with one click.
- WHEN staff provide an answer (dashboard, or the LINE `#kb` command), THE
  SYSTEM SHALL store it as a PENDING draft.
- WHEN asked, THE SYSTEM SHALL auto-draft candidate answers for the top gaps
  using the LLM, each as a PENDING draft.
- THE SYSTEM SHALL NEVER publish a draft automatically; a human approves.
- WHEN a draft is approved, THE SYSTEM SHALL emit a ready-to-file KB markdown
  document (frontmatter + body).

### R4 — Run unattended
As a maintainer, I want the backlog to shrink on its own.
- THE SYSTEM SHALL run auto-draft on a daily schedule, bounded to a few drafts
  per run to cap LLM cost.

### R5 — Security & privacy
- THE SYSTEM SHALL gate KB-authoring endpoints behind a staff token when one is
  configured (zero-config allowed for local demo).
- THE SYSTEM SHALL keep the public repo free of PII (masking at R1 covers the
  stored backlog).

## Non-goals
- No model fine-tuning / retrain (KB-driven only — keeps the 0-token promise).
- No auto-approval of drafts (domain is graduate-school facts; wrong answers
  are costly).
- No cross-tenant corpus sharing in this phase.
