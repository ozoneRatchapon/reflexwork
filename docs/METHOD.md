# ReflexWork — method, formulas and reproducible evidence

> **สรุปภาษาไทย (อ่านก่อน)**
> - เอกสารนี้อธิบาย *สิ่งที่โค้ดคำนวณจริง* (สูตร ค่าคงที่ และที่มาของแต่ละค่า) และวิธีรันเทียบกับ baseline ได้เอง: `benchmark/compare/run_all.sh`
> - ระบบคือ **ชั้นกฎ + ค้นคืนแบบเวกเตอร์ตัวอักษร + แคตตาล็อกทางการ** ที่ตรวจสอบย้อนหลังได้ ไม่มี neural network ในชั้นตอบคำถาม และ LLM ไม่ใช่แหล่งข้อเท็จจริง
> - สิ่งที่หลักฐานรองรับ: ความถูกต้องของข้อมูลทางการ, ความซ้ำได้, ความเร็ว, ค้นภาษาไทยด้วย trigram ดีกว่าตัดคำด้วยช่องว่าง **+42 จุด**, การ์ดหลักสูตร **ผิดใบ 0** จากชื่อที่ถูกทำให้เพี้ยน 1,915 แบบ
> - สิ่งที่หลักฐาน **ไม่รองรับ** (ห้ามอ้างใน pitch): ว่าการผสม "symbolic + cosine" ดีกว่า cosine เฉยๆ, ว่า weight ของ gate "เรียนรู้จากข้อมูล", ว่าเป็น "neuro-symbolic" ในความหมายเคร่งครัด, และ gate ในหน้าแชทตอนนี้ **ไม่มีผลต่อการตัดสินใจ** (ดูหัวข้อ 3.1)
> - ข้อ 8 คือสิ่งที่ควรแก้ก่อนให้นักวิจัยตรวจ

Version: 2026-11-02 · Code: this repository · Numbers below are copied from `benchmark/compare/results/002_2026-11-02.md` (run at commit `670ce68`); regenerate with `benchmark/compare/run_all.sh`. §3.1's gate figures come from `gate_probe` below.

## 1. What the system is (and is not)

A student-facing assistant for a university graduate school whose design rule is **facts come from a verified source, never from a language model**:

| layer | what it does | computation | deterministic | code |
|---|---|---|---|---|
| input cleaning | NFC, strip zero-width chars, collapse runs of 3+ identical Thai letters | string rules | yes | `chatbot.html` `<chat-normalize>` |
| kernel gate | route decision + reproducibility fingerprint | logistic gate on 64-d features (§3.1) | yes | `crates/reflex-wasm`, `crates/reflex-kernel` |
| KB retrieval | find the approved FAQ entry | char-trigram TF-IDF cosine + overlap (§3.2) | yes | `crates/reflex-wasm::kb_search`, JS twin `_jsSearch` |
| programme resolver | 379 graduate programmes: card / picker / finder | trigram coverage + rules over an official catalogue (§3.3) | yes | `chatbot.html` `<programme-resolve>`, `submissions/build_programme_catalogue.py` |
| link layer | systems named in prose become official links | allowlisted regex registry (§3.4) | yes | `<linkify>`, `submissions/ui/system-links.json` |
| learning loop | unanswered questions → PII-masked gap log → LLM *drafts* → human approves | server side | LLM only drafts, a human publishes | `integrations/kernel-worker`, `docs/learning-loop-design.md` |
| LLM | rephrase an already-retrieved KB answer (grounded), guarded by `groundedGuard` | Gemini / local model | **no** | `integrations/llm-proxy` |

There is **no neural network in the answering path**. The LLM is optional and cannot add facts: a sentence of its output containing numbers or names absent from the supplied KB text is dropped (`groundedGuard`). As of this writing the LLM backend is failing in production (the proxy returns its `fallback`), so every answer a user receives is produced by the deterministic layers.

## 2. Terminology — what we can honestly call it

Earlier documents (`submissions/concept-paper.md`, `slides.html`, code comments) say "neurosymbolic". Strictly, neuro-symbolic means a neural component coupled to a symbolic one. This system's retrieval is **TF-IDF vectors (sub-symbolic, but not neural) + lexical overlap (symbolic)**. A reviewer from that field will object. Suggested wording: *"hybrid lexical–vector retrieval with a calibrated abstention gate, and a symbolic layer over an official data catalogue."* The term becomes accurate if an LLM is added **only as a parser** (free text → `{intent, programme code, topic}`) that a symbolic executor then answers from the catalogue; that is the planned next step and is not built.

## 3. Formulas, exactly as implemented

### 3.1 Kernel gate (`crates/reflex-wasm/src/lib.rs`, mirrors `policy.rs`)

```
x ∈ ℝ⁶⁴ :  x[0..8] one-hot category · x[8] = 0.7·c + 0.3·priority/255 · x[16] = budget/4096 · x[24] = 1
c = σ(0.005·(len(input) − 500))                      (complexity = squashed input length)
g = σ(wᵀx + b),  σ(z) = 1/(1+e⁻ᶻ)
route = FastPath            if g < 0.55·θ  or  0.55·θ ≤ g < θ
        softmax(W·x + b′)   if g ≥ θ        (θ = 0.72)
```
Weights are **hand-seeded priors**, not fitted: `w[8]=4.0, w[0]=1.5, w[1]=1.2, w[2]=−2.0, w[3]=0.8, w[4]=−1.5, w[6]=2.0, b=−1.6`. The native kernel can adapt them online by an EMA reward update `w ← α·w + (1−α)·r·x` (α = 0.97); the browser build is stateless.

**Finding (measured with the shipped WASM, `gate_probe`):** the web chat always calls `route_task('DataQuery', q, 2048, 128)`. With those constants `g` rises from 0.058 (5 chars) to a ceiling of **≈ 0.451** (≥ 2000 chars) and can never reach θ = 0.72 or the 0.60/0.80 "rethink" bands. The gate therefore returns `FastPath` for every web query; *the answer/abstain decision is made entirely by the retrieval score in §3.2*. The gate still produces the fingerprint, but it is currently not a decision-maker in the page. The live counter "87 % fast path" on the worker's `/status` is consequently **not** a measure of KB answerability (31 routed requests; the real figure is in §5 A2).

**Fingerprint, not proof.** Browser: `BLAKE3(input ‖ route ‖ category)`; native: `BLAKE3(H(task) ‖ H(policy snapshot) ‖ H(decision))`. Both let anyone recompute the same digest from the same inputs (replay / tamper-evidence). Neither proves the decision was *correct*, and the browser variant does not commit to the weights.

### 3.2 KB retrieval (`_jsSearch` ≡ `kb_search`; lockstep 52/52 tested)

```
grams(t)  = { whitespace tokens of t with len>1 } ∪ { char 3-grams of lowercase t }
idf(g)    = ln((N+1)/(df(g)+1)) + 1                        (N = #entries, df over entries' keyword text)
v(t)      = L2-normalised binary vector of idf(g), g ∈ grams(t)
cos(q,d)  = v(q)·v(d)
overlap   = |{ g ∈ grams(q) : g is a substring of d.keywords }|
rank      = cos desc, overlap breaks ties                   ← ranking uses cosine only
score s   = 6 if (ov≥8 ∧ lead≥4) ∨ (cos≥0.40 ∧ margin≥0.08);  5 if (ov≥5 ∧ lead≥2) ∨ cos≥0.30;
            4 if cos≥0.20;  3 if cos≥0.15;  else max(1, round(10·cos))
answer without an LLM if s ≥ 4 (borderline 2–3 → ask which entry; below → hand off)
```
`lead`/`margin` are overlap/cosine gaps to the runner-up. **Provenance of the constants:** chosen by hand. The overlap rule (`ov≥8 ∧ lead≥4`) was added to fix one observed failure ("Turnitin เกิน 25%": overlap 15 but cosine only 0.20) and the floors were set from this same 50-query eval, so the eval numbers below are **in-sample for the confidence thresholds** and should be read as optimistic.

### 3.3 Programme resolver

Input is cleaned (§1), then intent/level words are removed only as whole phrases at the start or end of the question (never inside a name: ต่อมไร้ท่อ, ศึกษาศาสตร์). Tone marks / karan (U+0E47–0E4C) are ignored on both sides. For each programme name `h` (Thai core, Thai full, English title) and cleaned question `n`:

```
cov = max( |G₃(n) ∩ G₃(h)| / |G₃(n)| ,  pieces(n,h) )     G₃ = char trigrams;  pieces = share of n covered by ≥3-char substrings of h
candidate if cov ≥ 0.85  (strict)   ·   ≥ 0.5 (loose, near-miss picker only, used after the KB also found nothing)
score = cov + 1[h=n] + 0.3·1[h ⊇ n] − min(0.2, ||h|−|n||/200);  also: whole name h inside the question, if |h| ≥ 0.4·|n| (reverse containment)
pool = candidates within 0.15 of the best, filtered by level / international / special if the question says so
|pool| = 1 → card ·  2–12 → picker (≤ 6 shown) ·  > 12 → "too broad, narrow it" ·  loose mode → always a picker, never a card
```
Data are the Graduate School's own pages (379 programmes, 230 with a 2570 announcement), stored verbatim, stamped with the fetch date; status is a snapshot, not live. A fee/scholarship/other-topic question naming a programme is answered from that programme's own announcement; the follow-up layer ("แล้วค่าเทอมล่ะ") binds a short aspect question to the last single programme shown and always says how it was read (with an undo).

### 3.4 Link layer

Plain text in, escaped HTML out; only (a) `http(s)` URLs on `mahidol.ac.th | line.me | canva.site`, (b) LINE ids, (c) phrases in `system-links.json` whose URL was read from the Graduate School's own menu pages (each entry records the page and the label it was read from; `tests/linkify.test.mjs --online` re-checks every URL). Property tested over all 132 answers: the text is preserved byte for byte.

## 4. Evaluation protocol

| set | what | n | source of truth | reproducible from the repo |
|---|---|---|---|---|
| A | KB retrieval, labelled queries (exact / paraphrase / typo / English) + off-corpus | 50 + 2 | `tests/kb_search.test.mjs` | yes |
| B | programme names under seeded perturbation (official name + level, bare, one letter dropped, no tone marks, elongated, English title) | 379 programmes × 6 sets = 1,915 queries | `programmes.json` | yes |
| C | independent FAQ queries from another university team's own logs, 440-doc corpus | 31 | `benchmark/gradmahidol` | **no** (corpus is another team's; script only) |
| D | latency per layer, real WASM | — | `benchmark/compare/latency.mjs` | yes (machine-dependent) |

Metrics. *Ranking:* recall@1/@3, MRR with Wilson 95 % CIs; paired bootstrap (4,000 resamples, fixed seed) and exact McNemar for differences. *Confidence:* selective prediction — errors among the *k* most confident answers at the production coverage (k = 44/52), AURC (area under the risk–coverage curve, ties handled in expectation), AUROC; an off-corpus query that gets answered counts as an error. Baselines receive the better of two confidence definitions (top score or top-1 margin). *Programme names:* "right name", "exact code", **wrong card** (one programme with a different name shown as the answer — the harmful error), "no card", mean programmes shown.

## 5. Results (run 002, commit `670ce68`)

**A1 — ranking** (50 labelled queries)

| method | recall@1 (95 % CI) | recall@3 | MRR |
|---|---|---|---|
| **ours** | **84 %** (71–92) | 96 % | 0.90 |
| cosine only (ablation) | 84 % | 96 % | 0.90 |
| lexical overlap only (ablation) | 78 % | 94 % | 0.86 |
| BM25 over char-trigrams | 78 % | 96 % | 0.87 |
| BM25 over whitespace words | 42 % (29–56) | 50 % | 0.47 |

Paired, ours − baseline: vs overlap **+6 pp** [0, 14], p = 0.25 · vs BM25-char3 **+6 pp** [0, 14], p = 0.25 · vs BM25-word **+42 pp** [28, 56], p < 0.001. By kind (ours): exact 9/10, paraphrase 14/15, typo 7/10, English 12/15.

**A2 — confidence** (when is it safe to answer without an LLM?)

| method | wrong among the 44 most-confident | AURC ↓ | AUROC ↑ |
|---|---|---|---|
| ours (hand-set score) | 5 (11 %) | 0.06 | 0.84 |
| cosine only | 5 | 0.05 | 0.86 |
| BM25-char3 | 7 | 0.06 | 0.91 |
| lexical overlap only | 8 | 0.08 | 0.85 |
| BM25-word | 23 | 0.24 | 0.99* |
| ours, weights **fitted** (logistic, leave-one-out) | 6 | 0.07 | 0.81 |

\*AUROC measures separation, not accuracy; BM25-word separates its many errors well but makes them — read it with AURC.

**B — programme names** (379 programmes; seeds fixed)

| query set | ours: right name / exact | ours: **wrong card** | ours: no card | baseline: right name / exact | baseline: wrong card |
|---|---|---|---|---|---|
| official name + level | 100 % / 100 % | **0** | 0 | 100 % / 91 % | 0 |
| bare name | 100 % / 99 % | **0** | 0 | 98 % / 52 % | 6 |
| one letter dropped | 96 % / 95 % | **0** | 10 (3 %) | 99 % / 59 % | 2 |
| no tone marks | 100 % / 100 % | **0** | 0 | 97 % / 54 % | 6 |
| elongated ending | 100 % / 99 % | **0** | 0 | 98 % / 52 % | 6 |
| English title | 100 % / 100 % | **0** | 0 | 100 % / 96 % | 0 |

Baseline = char-trigram TF-IDF with the *same* input cleaning; one card if cosine ≥ 0.6 (fixed, untuned), else a picker of its top 6. It never abstains. Its "exact" is low because it shows one card where several programmes share a name (level / plan / faculty); ours asks which one (mean 1.6–2.8 programmes shown).

**C — independent corpus (not reproducible here):** FAQ-only (62 docs, 31 queries) recall@1 94 %, @3 100 %, 5/5 off-corpus rejected; full 440-doc corpus with a separate namespace for the 378 programme templates 87 % / 97 % (`benchmark/gradmahidol/RESULTS.md`). This is the least tuned evidence we have — but it is 31 queries and the corpus is not in the repo.

**D — latency** (Apple M-series, Node 24; medians): gate + fingerprint **1.9 µs** · input cleaning 0.3 µs · linkification 4.8 µs · programme resolver 3.4 µs (many queries exit early) with p95 **2.7 ms** (full scoring) · **KB search 3.7 ms (WASM) / 1.8 ms (JS twin)** — versus the 350–800 ms figure quoted for an LLM call (not measured here). The two nanosecond/microsecond figures quoted elsewhere (`policy_route` 12 ns, `feature_encode` 63 ns, Criterion) describe the gate only, not retrieval.

## 6. What the evidence supports

| claim | verdict |
|---|---|
| Answers are reproducible and auditable (same input → same output and fingerprint) | **supported** (double-run hashes identical; lockstep WASM/JS 52/52) |
| Facts about programmes (status, fees, plans, schedules) come from the official pages, verbatim | **supported**, with the caveat that status is a dated snapshot |
| Programme cards are not wrong under realistic typing slips | **supported on synthetic perturbations: 0 wrong cards / 1,915 queries**; real typing may differ |
| Character trigrams are the right unit for Thai (no word boundaries) | **supported: +42 pp** over whitespace-word BM25 (p < 0.001) |
| The deterministic layers are 10²–10⁵× faster than an LLM call | **supported** for routing and retrieval (µs–ms vs hundreds of ms) |
| The symbolic-overlap + cosine blend beats cosine alone | **not supported**: identical ranking by construction; confidence not better (AURC 0.06 vs 0.05, AUROC 0.84 vs 0.86); BM25-char3 has higher AUROC (0.91) |
| Gate weights are learned from data | **false** as implemented: hand-seeded; and fitting them on 52 queries (leave-one-out) did **not** help |
| The kernel gate decides whether an LLM is needed | **false in the web chat today** (§3.1: `g ≤ 0.451` always) |
| "87 % fast path" | **not a quality metric** (§3.1); use A2: 44/52 answered unaided at 5 errors |

## 7. Threats to validity

1. **Small n.** 50 labelled queries ⇒ ±10 pp CIs; every ranking difference except "vs whitespace-word BM25" is within noise.
2. **In-sample thresholds.** Score thresholds and the overlap-lift rule were set while looking at this eval; baselines are untuned.
3. **Authorship.** The eval queries were written by the team; Set C is the only externally authored one and is not shipped.
4. **Synthetic perturbations** (Set B) measure robustness to *how* a name is garbled, not whether users ask this way.
5. **Status is a snapshot** (2026-11-02); fees/dates change per announcement year.
6. **No dense-embedding baseline.** Not run (no model offline). A fair comparison needs one — protocol below.
7. **Single machine** for latency.

## 8. Fix before external review

1. **The gate is inert in the page (§3.1).** Either feed it real features — e.g. the retrieval features `(cos, margin, overlap, lead)` and query length — so it becomes the abstention decision it is described as, or describe it honestly as a replay fingerprint. Do not present "the kernel decides when an LLM is needed" until it does.
2. **The on-page "fast-path ratio" is not a measurement.** `updateRatio()` displays `auto/total·100 + 18·EMA(👍/👎)` percentage points — the 👍/👎 vote shifts the displayed percentage by up to ±18 pp. Show the raw ratio and the feedback EMA separately.
3. **Wording:** replace "neurosymbolic" (§2).
4. **KB search recomputes the index on every query.** Caching the per-KB gram sets / document frequencies gave **1775 → 275 µs (6.4×)** with identical results on the JS twin (scratch measurement); the WASM export needs a stateful index object (and a rebuild of the committed `.wasm`) to get the same.
5. Run the LLM backend diagnostics (`integrations/llm-proxy`, now reports each Gemini model's status) before claiming any LLM path in a demo.

## 9. Reproduce and compare

```bash
python3 submissions/build_knowledge_index.py        # approved-only KB index (not committed)
benchmark/compare/run_all.sh                         # writes benchmark/compare/results/NNN_<date>.md
node tests/kb_search.test.mjs && node tests/programme_resolve.test.mjs && node tests/linkify.test.mjs && node tests/chat_robust.test.mjs
node benchmark/compare/compare_retrievers.mjs --json out.json   # machine-readable
```
To compare another system fairly: (1) index the same `keywords` text of the 132 entries in `submissions/ui/knowledge-index.json`; (2) answer the 52 queries in `tests/kb_search.test.mjs` (labels and the per-query alternates in `ALT`); (3) report recall@1/@3 **and** the error count among your *k* = 44 most-confident answers, counting any off-corpus answer as an error; (4) report CIs. Obvious additions: a multilingual dense retriever (e.g. e5 / bge-m3) and an LLM-only baseline with and without retrieval — both worth running because the first is the natural competitor to our confidence and the second is what users compare us with. Queries contain no personal data; the KB is approved public FAQ text.

## 10. Data and ethics notes

Programme data are read-only copies of public pages; staff e-mails/names are never stored (contact lines are replaced). Another team's unapproved drafts (`ui/knowledge/`, git-ignored) are never deployed (`submissions/deploy_pages.sh` deploys committed files only). Page text and LLM output are treated as untrusted and escaped before rendering.
