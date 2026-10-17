// Smalltalk + affect kernel — kept in lockstep with the inline copy in
// submissions/ui/chatbot.html. Deterministic, 0 token, no AI.
//
// WHY: a greeting ("สวัสดี"), a thanks ("ขอบคุณ"), or "ทำอะไรได้บ้าง" is neither a
// knowledge question nor a staff case. Routing it to the LLM/staff fallback reads
// as a cold bot. A real front-desk person greets back and asks how they can help —
// letting the user finish their thought before anything is routed.
//
// The affect model is inspired by katgpt's NPC affect kernel
// (katopz.github.io/katgpt-web): the agent carries a MOOD that shifts with the
// conversation so its wrapper tone (greeting / empathy / sign-off) reads human.
// We keep it a tiny deterministic state machine — it tunes only the WRAPPER tone,
// never the KB facts (facts always come from the verified KB).

// --- Affect kernel -----------------------------------------------------------
export function createMood() {
  return {
    valence: 0.2,      // how the conversation is going, -1..+1
    turns: 0,
    lastWasMiss: false,
    missStreak: 0,     // consecutive misses — drives proactive escalation
    felt(kind) {
      this.turns++;
      if (kind === 'hit') this.valence = Math.min(1, this.valence + 0.25);
      else if (kind === 'miss') { this.valence = Math.max(-1, this.valence - 0.35); this.lastWasMiss = true; }
      else if (kind === 'thanks') this.valence = Math.min(1, this.valence + 0.3);
      if (kind === 'miss') this.missStreak++; else { this.lastWasMiss = false; this.missStreak = 0; }
      return this;
    },
    // BEHAVIOR signal (not a fact change): after repeated failures a caring
    // human stops re-trying the same path and proactively escalates. The mood
    // thus changes WHAT THE BOT DOES (surface staff sooner / more prominently),
    // never the KB facts. Two misses in a row, or a clearly-negative mood.
    frustrated() { return this.missStreak >= 2 || this.valence <= -0.3; },
    greetOpener() {
      if (this.turns <= 0) return 'สวัสดีครับ';
      return this.valence > 0.5 ? 'ยินดีครับ' : 'สวัสดีครับ';
    },
    empathy() {
      return this.lastWasMiss
        ? 'ขอโทษด้วยนะครับที่ยังหาคำตอบให้ไม่ได้'
        : 'เรื่องนี้ขอให้เจ้าหน้าที่ช่วยดูแลต่อนะครับ';
    },
    // A glanceable snapshot of the current mood for a UI indicator. Pure
    // function of valence/lastWasMiss — deterministic, auditable, no AI.
    snapshot() {
      if (this.lastWasMiss)      return { emoji: '😟', label: 'เป็นห่วง',   hue: 'miss' };
      if (this.valence >= 0.6)   return { emoji: '😊', label: 'อารมณ์ดี',   hue: 'warm' };
      if (this.valence >= 0.3)   return { emoji: '🙂', label: 'พร้อมช่วย',  hue: 'ok'   };
      if (this.valence <= -0.2)  return { emoji: '😔', label: 'กังวล',      hue: 'low'  };
      return { emoji: '🦀', label: 'ตั้งใจฟัง', hue: 'neutral' };
    },
  };
}

// --- Smalltalk intent scorer -------------------------------------------------
// DISTILLED from katgpt-rs `PersonalityWeightedComposition` (crates/
// katgpt-personality, Plan 297): instead of an ordered if-else/regex chain that
// short-circuits on the first match, we extract a small FEATURE VECTOR from the
// message and score each intent as `sigmoid(dot(features, w_intent) / tau)`,
// then take the argmax intent whose gate clears a threshold. This is the same
// shape as katgpt's kernel — per-intent SIGNED weights, sigmoid gate (NEVER
// softmax, so intents don't couple), deterministic, 0-token, auditable.
//
// Why this beats the if-else: negation/sarcasm is no longer a special-case
// guard clause — it is a NEGATIVE-weight feature ("neg") that drags the
// positive-affect intents (thanks / howareyou) below their gate, exactly like a
// resisting personality layer in katgpt. "ขอบคุณที่ไม่ช่วย" scores thanks=+ with
// neg=− → net below gate → falls through. One mechanism, not two.
//
// We do NOT pull in the Rust crate (it is wasm32-buildable but needs latent
// embeddings + a second WASM module + marshaling for what is a tiny intent
// head). We distil the ALGORITHM, which is the portable part.

// Feature extractors: each maps the message to a 0/1 (or count-capped) signal.
// Thai has no word spaces, so these are substring/regex probes, not tokens.
const _FEATURES = [
  ['greet_lead', /^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey|ฮัลโหล|โย่|ทัก)/i],
  ['thanks_w',   /(?:ขอบคุณ|ขอบใจ|thank|thx)/i],
  ['praise_w',   /(?:เยี่ยม|สุดยอด|เก่งมาก|เก่งจัง|ฉลาด|ดีจัง|great job|awesome|well done)/i],
  ['bye_lead',   /^(?:บาย|ลาก่อน|ไปละ|แค่นี้|bye|goodbye|โอเคครับ|โอเคค่ะ)/i],
  ['whatcan_w',  /(?:ทำอะไรได้|ช่วยอะไรได้|คุณคือใคร|คุณเป็นใคร|ใช้ยังไง|นี่คืออะไร|what can you|who are you)/i],
  ['howareyou_w',/(?:สบายดี(?:ไหม|มั้ย)|เป็นไงบ้าง|เป็นยังไงบ้าง|how are you)/i],
  // question/topic signal — presence means "this is a real question"
  ['question',   /\?|กี่|เท่าไร|อย่างไร|ยังไง|ทำไม|วิธี|ขั้นตอน|turnitin|ลงทะเบียน|วิทยานิพนธ์|สอบ|ค่า/i],
  // negation / complaint signal — sarcasm or dissatisfaction
  ['neg', new RegExp([
    'ไม่\\s*(?:ช่วย|ได้|เห็น|รู้|เข้าใจ|ตรง|โอเค|เวิร์ก|เวิร์ค|มีประโยชน์)',
    'ไม่เอา','ไม่ไหว','ผิด(?:อีก|แล้ว|มหันต์)?','มั่ว','พัง','เสียเวลา','เสียดาย',
    'ห่วย','แย่','โง่','งี่เง่า','กาก','ไร้สาระ','น่าเบื่อ','ทำพัง','บ้า(?!ง)',
    'useless','worthless','terrible','awful','waste of',"doesn'?t work",
    "didn'?t (?:help|work)",'not (?:helpful|working|useful)','no help','so (?:dumb|stupid|bad)',
  ].join('|'), 'i')],
];
const _FEAT_INDEX = Object.fromEntries(_FEATURES.map(([n], i) => [n, i]));

// Per-intent weight rows over the feature vector (signed). Positive = this
// feature pushes toward the intent; negative = it resists. `neg` has a large
// negative weight on the affect intents, so a complaint cancels false warmth.
// `question` resists every smalltalk intent (a real question is not smalltalk).
// These are HAND-SET (authored like a game's archetype table), not trained —
// the distilled mechanism is the scorer, not a learned model.
function _row(obj) { const r = new Array(_FEATURES.length).fill(0); for (const k in obj) r[_FEAT_INDEX[k]] = obj[k]; return r; }
const _INTENTS = [
  { kind: 'greet',     w: _row({ greet_lead: 1.0, question: -0.9 }) },
  { kind: 'thanks',    w: _row({ thanks_w: 1.0, praise_w: 0.7, neg: -1.6, question: -0.5 }) },
  { kind: 'howareyou', w: _row({ howareyou_w: 1.0, neg: -1.6, question: -0.5 }) },
  { kind: 'whatcan',   w: _row({ whatcan_w: 1.0, neg: -1.6, question: -0.3 }) },
  { kind: 'bye',       w: _row({ bye_lead: 1.0, question: -0.9 }) },
];
const _TAU = 0.6;        // gate temperature
const _GATE = 0.5;       // sigmoid(x) > 0.5 ⟺ x > 0 — the intent must net positive

function _sig(x) { return 1 / (1 + Math.exp(-x / _TAU)); }

// Returns { kind, score } for the best-scoring intent above the gate, or null.
// Exposed so callers / tests can see the gate value (auditability).
export function scoreSmalltalk(text) {
  const q = String(text || '').trim();
  if (!q) return null;
  // Feature vector (0/1). A leading greeting on an otherwise-real question is
  // stripped first so "สวัสดี ค่าสอบเท่าไร" scores as a question, not a greet.
  const stripped = q.replace(/^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey)\s*,?\s*/i, '');
  const probeOn = (stripped.length > 3 && /\?|กี่|เท่าไร|อย่างไร|ยังไง|ทำไม|วิธี|ขั้นตอน|turnitin|ลงทะเบียน|วิทยานิพนธ์|สอบ|ค่า/i.test(stripped))
    ? stripped : q;
  const f = _FEATURES.map(([, re]) => (re.test(probeOn) ? 1 : 0));
  let best = null;
  for (const it of _INTENTS) {
    let dot = 0;
    for (let i = 0; i < f.length; i++) dot += f[i] * it.w[i];
    const gate = _sig(dot);
    if (gate > _GATE && (!best || gate > best.score)) best = { kind: it.kind, score: gate };
  }
  return best;
}

// Back-compatible API: returns just the intent kind (or null). Same contract
// the old regex classifier had, so callers/tests are unchanged.
export function classifySmalltalk(text) {
  const r = scoreSmalltalk(text);
  return r ? r.kind : null;
}

export function smalltalkReply(kind, mood) {
  const op = mood ? mood.greetOpener() : 'สวัสดีครับ';
  switch (kind) {
    case 'greet':
      return `${op} 🦀 ผมเป็นผู้ช่วยตอบคำถามเรื่องลงทะเบียนและวิทยานิพนธ์ของบัณฑิตวิทยาลัยครับ — มีเรื่องอะไรให้ช่วยไหมครับ? เล่ามาได้เลย เช่น กำหนดส่งรูปเล่ม · Turnitin · ค่าสอบ · การลงทะเบียน`;
    case 'thanks':
      return `ยินดีครับ 🙂 ถ้ามีอะไรให้ช่วยอีกถามได้เลยนะครับ`;
    case 'bye':
      return `ด้วยความยินดีครับ ขอให้ทำวิทยานิพนธ์ราบรื่นนะครับ 🦀`;
    case 'whatcan':
      return `ผมตอบคำถามเรื่องบัณฑิตวิทยาลัยได้ครับ — กำหนดส่งวิทยานิพนธ์ · Turnitin/การตรวจความซ้ำ · บทคัดย่อ · การลงทะเบียน · ค่าสอบ/ค่าธรรมเนียม และถ้าเป็นปัญหาบัญชี/ระบบ ผมจะช่วยเก็บข้อมูลส่งต่อเจ้าหน้าที่ให้ครับ ลองถามมาได้เลย`;
    case 'howareyou':
      return `สบายดีครับ พร้อมช่วยเต็มที่ 🦀 มีเรื่องวิทยานิพนธ์หรือการลงทะเบียนอะไรให้ช่วยไหมครับ?`;
    default:
      return `${op} มีอะไรให้ช่วยไหมครับ?`;
  }
}
