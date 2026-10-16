// ReflexWork — Rethink layer (deterministic 2-stage gate, no AI)
// ----------------------------------------------------------------------------
// System 1 / System 2, done without a model. The kernel's sigmoid gate is a
// fast reflex (System 1). When its confidence is BORDERLINE, instead of
// immediately paying for an LLM we RETHINK (System 2) with cheap deterministic
// moves — and only escalate if rethink also fails. This is exactly the
// reflex→rethink principle (abstain / reconsider instead of guessing), kept
// free, microsecond, and reproducible.
//
//        kernel gate g  ──▶  g < θ_low           → ACT (FastPath, answer now)
//                            θ_low ≤ g < θ_high  → RETHINK (this module)
//                            g ≥ θ_high          → ESCALATE (LLM)
//
// RETHINK tries, in order:
//   1. strong KB hit after a relaxed re-score      → answer (recovered)
//   2. two close candidates                         → disambiguate (ask, no AI)
//   3. nothing convincing                           → escalate to LLM
//
// Returns a verdict the caller renders. It never calls a network or a model.
// ----------------------------------------------------------------------------

// Default band around the kernel threshold θ=0.72. Inside the band we rethink
// rather than trust the reflex. Tunable per deployment.
export const GATE = { low: 0.60, high: 0.80 };

/**
 * Decide what to do with a message, with a rethink stage in the borderline band.
 *
 * @param {object}   p
 * @param {number}   p.gate      kernel sigmoid score g ∈ [0,1] (higher = more "needs LLM")
 * @param {Array<{e:object,s:number}>} p.ranked  KB matches, best first ({entry, score})
 * @param {object}   [p.band]    override {low, high}
 * @returns {{action:'act'|'disambiguate'|'escalate', stage:'reflex'|'rethink',
 *            entry?:object, candidates?:object[], reason:string}}
 */
export function decide({ gate, ranked, band = GATE }) {
  const top = ranked[0] || null;
  const second = ranked[1] || null;

  // --- Stage 1: REFLEX. Clear-cut cases skip rethink entirely. ---------------
  if (typeof gate === 'number' && gate < band.low) {
    if (top && top.s >= 4) {
      return { action: 'act', stage: 'reflex', entry: top.e,
               reason: 'gate ต่ำ + KB ตรงชัด — ตอบทันที' };
    }
    // gate says fast but KB is thin → fall through to rethink
  }
  if (typeof gate === 'number' && gate >= band.high && !(top && top.s >= 6)) {
    return { action: 'escalate', stage: 'reflex',
             reason: 'gate สูง + KB ไม่ตรงพอ — ส่ง LLM' };
  }

  // --- Stage 2: RETHINK (System 2). Borderline, or reflex was inconclusive. ---
  // 2a. A genuinely strong hit → recover to a FastPath answer (saved an LLM call).
  if (top && top.s >= 4 && (!second || top.s - second.s >= 2)) {
    return { action: 'act', stage: 'rethink', entry: top.e,
             reason: 'คิดซ้ำแล้วเจอข้อที่ตรงชัด — ตอบจากคู่มือ (ไม่ต้องเรียก AI)' };
  }
  // 2b. Two close candidates → ask which, deterministically (still no AI).
  if (top && second && top.s >= 2 && (top.s - second.s) <= 1) {
    return { action: 'disambiguate', stage: 'rethink',
             candidates: ranked.slice(0, 3).map(r => r.e),
             reason: 'คิดซ้ำแล้วมี 2 ข้อใกล้กัน — ถามให้ชัดก่อน (ยังไม่เรียก AI)' };
  }
  // 2c. A single weak-ish hit → still try to answer rather than pay for AI.
  if (top && top.s >= 3) {
    return { action: 'act', stage: 'rethink', entry: top.e,
             reason: 'คิดซ้ำแล้วมีข้อที่พอตรง — ตอบจากคู่มือก่อน' };
  }
  // 2d. Rethink exhausted → escalate.
  return { action: 'escalate', stage: 'rethink',
           reason: 'คิดซ้ำแล้วยังไม่พบในคู่มือ — จึงส่งให้ AI' };
}
