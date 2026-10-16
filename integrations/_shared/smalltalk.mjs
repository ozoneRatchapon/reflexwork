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
    felt(kind) {
      this.turns++;
      if (kind === 'hit') this.valence = Math.min(1, this.valence + 0.25);
      else if (kind === 'miss') { this.valence = Math.max(-1, this.valence - 0.35); this.lastWasMiss = true; }
      else if (kind === 'thanks') this.valence = Math.min(1, this.valence + 0.3);
      if (kind !== 'miss') this.lastWasMiss = false;
      return this;
    },
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

// --- Smalltalk classifier ----------------------------------------------------
const _SMALLTALK = [
  { kind: 'greet',     re: /^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey|ฮัลโหล|โย่|ทัก)/i },
  { kind: 'thanks',    re: /(?:ขอบคุณ|ขอบใจ|thank|thx|เยี่ยม|สุดยอด|เก่งมาก)/i },
  { kind: 'bye',       re: /^(?:บาย|ลาก่อน|ไปละ|แค่นี้|bye|goodbye|โอเคครับ|โอเคค่ะ)/i },
  { kind: 'whatcan',   re: /(?:ทำอะไรได้|ช่วยอะไรได้|คุณคือใคร|คุณเป็นใคร|ใช้ยังไง|นี่คืออะไร|what can you|who are you)/i },
  { kind: 'howareyou', re: /(?:สบายดี(?:ไหม|มั้ย)|เป็นไงบ้าง|เป็นยังไงบ้าง|how are you)/i },
];

// Question words / topic keywords that mean "this is a real question, not pure
// smalltalk" even if it opens with a greeting.
const _IS_QUESTION = /\?|กี่|เท่าไร|อย่างไร|ยังไง|ทำไม|วิธี|ขั้นตอน|turnitin|ลงทะเบียน|วิทยานิพนธ์|สอบ|ค่า/i;
const _LEAD_GREETING = /^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey)\s*,?\s*/i;
// Negation / complaint markers: a "thanks" riding one of these is sarcasm
// ("ขอบคุณที่ไม่ช่วยอะไรเลย"), not genuine. We must NOT beam about that — reading
// sarcasm as praise is exactly the uncanny tell. Treat it as a real message and
// let the kernel/staff path handle it instead of a cheery smalltalk reply.
const _NEGATION = /ไม่ช่วย|ไม่ได้|ไม่เห็น|ไม่มีประโยชน์|เสียเวลา|ห่วย|แย่|โง่|งี่เง่า|useless|worthless|terrible|waste of/i;

export function classifySmalltalk(text) {
  const q = String(text || '').trim();
  if (!q) return null;
  if (_IS_QUESTION.test(q)) {
    // "สวัสดี ค่าสอบเท่าไร" → strip the greeting, treat the rest as a question.
    if (q.replace(_LEAD_GREETING, '').length > 3) return null;
  }
  for (const s of _SMALLTALK) {
    if (!s.re.test(q)) continue;
    // Sarcastic "thanks for nothing" → not genuine gratitude. Fall through.
    if (s.kind === 'thanks' && _NEGATION.test(q)) return null;
    return s.kind;
  }
  return null;
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
