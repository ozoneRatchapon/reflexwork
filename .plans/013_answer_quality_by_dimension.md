# 013 - Answer quality on every dimension: measure first, then decide per dimension (2026-11-08)

Goal: the chat answers well on every dimension the owner cares about. No single method does this. Each dimension gets its own
measure, and the method changes only where the measure says it is weak. Rules stay where they are safe and auditable.

Current state (verified 2026-11-08):
- Route (which branch answers) is an ordered set of regex rules in `crates/reflex-wasm/src/route/`, checked by golden files.
- The `reflex-wasm` gate (`seeded_weights`) is a fixed sigmoid with seeded weights. It is not trained on our data and does not pick the answer.
- The AI rewrite step is optional (`ai_off`).
- End-to-end answer correctness has NOT been measured. No number exists yet for "is the answer right".

## Dimensions and their measures (decide the target numbers with the owner)
1. Safety: wrong or missing answer on crisis, personal-data, or wellbeing questions. Target: zero misroutes on the labelled safety set.
2. Correctness: the answer states what the KB says. Measure: a labelled set of questions with the expected KB entry; score = answer contains the expected fact.
3. Retrieval: the right KB entry is in the top k. Measure: recall@1 and recall@3 on the same set.
4. Abstention: an out-of-scope question gets "not found", not a guess. Measure: precision and recall of abstain on a labelled out-of-scope set.
5. Routing: the right branch answers. Measure: the existing golden (`benchmark/golden/route.json`), which is already in place.
6. Latency and cost: p95 time to answer; LLM calls per answer.

## Steps
1. Build the labelled sets for dimensions 1-4 from real questions (the gap log and the synth set, reviewed by the owner). Do not use the set
   that tuned the rules as the held-out test.
2. Measure the current system on all six dimensions. Write the numbers to `benchmark/quality/` (numbered, as the benchmark rule says).
3. Only for a dimension that fails its target: pick the method from this list, one at a time, and re-measure.
   - Retrieval weak: add keyword + embedding hybrid search; keep the rules for the branch choice.
   - Correctness weak but retrieval good: have the LLM rewrite only from the retrieved text, and cite the entry id.
   - Abstention weak: raise the retrieval score threshold; check it on the held-out set.
   - Routing weak: fit thresholds (or a small classifier) on the labelled data, then check on the held-out set.
   - Safety: stays rule-based (crisis words, personal-data branch). Any model is only an extra check, never the only check.
4. Keep the gate set of plan 012 for every change. A change that improves one dimension and breaks safety is rejected.

## Not in this plan
- Hospital clinical rules (plan 011 "Hospital-specific risks" and the owner inputs there).
- Changing the wellbeing wording or escalation path. These need the owner's clinicians.

## Owner inputs needed
- The target number for each dimension, and which dimension matters most when they conflict.
- Who labels the held-out sets (the expected KB entry and the expected abstain).
- Whether an LLM may run in production for this deployment (`ai_off` is set on some deployments).
