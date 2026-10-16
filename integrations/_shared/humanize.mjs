// ReflexWork — Template NLG ("ภาษาคน" without AI)
// ----------------------------------------------------------------------------
// Turns a verified KB answer into a sentence that reads like a person wrote it,
// WITHOUT calling an LLM. This is deterministic Natural Language Generation: a
// seeded grammar (the technique voice assistants used before LLMs). Properties:
//   • human-sounding  — varied openers / framing / closers, picked per message
//   • deterministic   — same (question, answer) → same text, so it is auditable
//   • free + instant  — 0 token, microseconds, runs at the edge / in-browser
//
// The examiner's objection ("keyword answers feel blunt, I want AI to read and
// reply like a human") conflates two layers. We split them: the KERNEL decides
// (µs, no AI); this RENDERS the decision in human language (no AI either).
// ----------------------------------------------------------------------------

// FNV-1a — tiny, stable string hash. Same string → same number, everywhere.
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (arr, seed) => arr[(seed >>> 0) % arr.length] ?? '';

// Pools kept intentionally large so repeats are rare. Each pool is drawn with a
// DIFFERENT derived seed, so opener/connector/closer vary independently —
// 11 × 6 × 9 ≈ 600 natural combinations before anything repeats verbatim.
const OPENERS = [
  'ได้เลยครับ', 'เรื่องนี้ตอบได้ครับ', 'ตามระเบียบบัณฑิตวิทยาลัยนะครับ',
  'สรุปให้สั้น ๆ ครับ', 'อธิบายให้ฟังนะครับ', 'เป็นแบบนี้ครับ',
  'คำตอบคือแบบนี้ครับ', 'ยินดีช่วยครับ', 'เข้าใจคำถามแล้วครับ',
  'ประเด็นนี้ชัดเจนครับ', 'ขออธิบายตามคู่มือครับ',
];
// connectors bridge the opener into the fact without sounding templated
const CONNECTORS = ['', ' — ', ' ', ' คือ ', ': ', ' โดย '];
const CLOSERS = [
  'หากต้องการรายละเอียดเพิ่มเติม ดูได้จากแหล่งอ้างอิงด้านล่างครับ',
  'ถ้ายังมีข้อสงสัย ถามต่อได้เลยครับ',
  'หวังว่าช่วยได้ครับ 🙂',
  'มีอะไรให้ช่วยอีกไหมครับ',
  'ลองถามเพิ่มได้นะครับ',
  'ข้อมูลนี้อ้างอิงจากคู่มือทางการครับ',
  '', '', '',   // weighted blanks: a real person doesn't always add a closer
];

// Light question-type framing: if the user clearly asks "how long / how much /
// how", lead with a matching frame so the reply sounds responsive, not canned.
function frameFor(question) {
  const q = (question || '').toLowerCase();
  if (/กี่วัน|ภายในกี่|นานแค่ไหน|เมื่อไหร่|กี่สัปดาห์/.test(q)) return 'เรื่องระยะเวลา ';
  if (/เท่าไร|กี่บาท|ค่าใช้จ่าย|ราคา|ค่าธรรมเนียม/.test(q)) return 'เรื่องค่าใช้จ่าย ';
  if (/อย่างไร|ยังไง|ขั้นตอน|ทำไง|วิธี/.test(q)) return 'ขั้นตอนเป็นแบบนี้ ';
  if (/ต้อง|จำเป็น|เงื่อนไข/.test(q)) return 'เงื่อนไขคือ ';
  return '';
}

/**
 * Compose a human-sounding reply from a KB entry.
 * @param {{title?:string, answer?:string}} entry  the matched KB row
 * @param {string} question                        the user's exact question
 * @returns {string} a natural-language answer (no AI)
 */
export function humanize(entry, question) {
  const body = String(entry?.answer || '').trim();
  if (!body) return '(ดูรายละเอียดในแหล่งอ้างอิงครับ)';
  const seed = hashStr((question || '') + '|' + (entry?.title || ''));
  const opener = pick(OPENERS, seed);
  const frame = frameFor(question);
  const closer = pick(CLOSERS, seed >> 11);

  // Join opener → fact. If we have a type-frame ("เรื่องระยะเวลา"), it IS the
  // bridge (always preceded by a space, never doubled with a connector). With
  // no frame, use a varied connector, falling back to a plain space.
  let bridge;
  if (frame) {
    bridge = ' ' + frame;                     // "ได้เลยครับ เรื่องระยะเวลา ..."
  } else {
    const c = pick(CONNECTORS, seed >> 5);
    bridge = c && c.trim() ? c : ' ';         // real connector, else a space
  }
  let out = opener + bridge + body;
  if (closer) out += ' ' + closer;
  return out;
}

export { hashStr as _hashStr };
