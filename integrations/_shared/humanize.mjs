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

// Pools kept SMALL and FACTUAL. A real person answering an FAQ is direct — they
// lead with the fact, not with "ยินดีช่วยครับ ขออธิบายตามคู่มือครับ...". Earlier
// versions stacked a flowery opener AND a salesy closer on every reply, which
// reads MORE robotic (uncanny), not less. So: at most a short, optional frame,
// the fact, and usually no closer at all.
const OPENERS = [
  '', '', '', '',                       // most replies open straight with the fact
  'ตามระเบียบ', 'สรุปสั้น ๆ', 'เท่าที่คู่มือระบุ',
];
const CONNECTORS = ['', ' ', ' คือ ', ': '];
const CLOSERS = [
  '', '', '', '', '', '',                // a real person usually stops at the fact
  'ถ้ายังสงสัย ถามต่อได้',
  'รายละเอียดเพิ่มเติมดูที่แหล่งอ้างอิงด้านล่าง',
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

// --- Slot-filling: answer the SPECIFIC thing asked, not just dump the row -----
// Detect the question's intent, then pull the matching fact (a slot) out of the
// KB answer and lead with a direct sentence about it. Still 100% deterministic:
// it is pattern extraction, not generation. "ส่งกี่วัน" → "ภายใน 21 วันครับ".
const SLOTS = [
  { // DURATION — "กี่วัน / นานแค่ไหน"
    ask: /กี่วัน|ภายในกี่|นานแค่ไหน|กี่สัปดาห์|กี่เดือน|ระยะเวลา/,
    grab: /(?:ไม่เกิน|ภายใน|ประมาณ|ราว ?ๆ?)?\s*\d+\s*(?:วัน(?:ทำการ)?|สัปดาห์|เดือน)/,
    lead: (m) => `${/ไม่เกิน|ภายใน/.test(m) ? '' : 'ภายใน'}${m}`,
  },
  { // COST — "เท่าไร / กี่บาท"
    ask: /เท่าไร|เท่าไหร่|กี่บาท|ค่าใช้จ่าย|ราคา|ค่าธรรมเนียม|ค่าสอบ|ค่าตอบแทน/,
    grab: /\d[\d,]*\s*บาท/,
    lead: (m) => `${m}`,
  },
  { // PERCENT / THRESHOLD — "เกินกี่ % / ไม่เกินเท่าไร"
    ask: /กี่ ?%|กี่เปอร์|เกินเท่าไร|เกินกี่|ไม่เกินเท่าไร/,
    grab: /(?:ไม่เกิน|เกิน)?\s*\d+\s*%/,
    lead: (m) => `${m}`,
  },
];

// Returns a direct lead sentence for the asked slot, or '' if none applies.
function slotLead(entry, question) {
  const q = (question || '');
  const body = String(entry?.answer || '');
  for (const s of SLOTS) {
    if (!s.ask.test(q)) continue;
    const m = body.match(s.grab);
    if (m) return s.lead(m[0].trim().replace(/\s+/g, ' '));
  }
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
  let opener = pick(OPENERS, seed);
  const closer = pick(CLOSERS, seed >> 11);

  const lead = slotLead(entry, question);
  let text;
  if (lead) {
    // Direct: "ภายใน 21 วัน — รายละเอียด: <full answer>". The fact IS the opener.
    text = `${lead} — รายละเอียด: ${body}`;
    opener = '';
  } else {
    const frame = frameFor(question);
    if (frame) {
      text = frame + body;
    } else {
      const c = pick(CONNECTORS, seed >> 5);
      text = (opener && c && c.trim()) ? (opener + c + body) : (opener ? opener + ' ' + body : body);
      opener = ''; // connector path already consumed the opener
    }
  }
  let out = opener ? (opener + ' ' + text) : text;
  if (closer) out += ' ' + closer;
  return out.replace(/\s+/g, ' ').trim();
}

export { hashStr as _hashStr, slotLead };
