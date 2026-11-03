// ReflexWork — readable KB answer for plain-text channels (LINE).
// ----------------------------------------------------------------------------
// The manual's own words, unchanged, cut into short points. The first point is the
// answer, the rest are bullets. If the question asks for a number (กี่วัน/กี่บาท/กี่ %),
// that number from the entry leads. Only whitespace, a trailing full stop and list
// markers are removed. Deterministic, no AI.
//
// Replaces _shared/humanize.mjs (2026-11-03). Graduate School staff said answers
// "read oddly, long paragraphs, hard to read"; the old template glued an opener
// ("ขั้นตอนเป็นแบบนี้ …") onto a one-paragraph answer.
// answerPoints() MUST match the inline copy in submissions/ui/chatbot.html:
// tests/answer_points_parity.test.mjs compares both over the whole knowledge index.
// (One Rust implementation for both is planned: .plans/002_rust-core-migration.md.)
// ----------------------------------------------------------------------------

const SPLIT_BEFORE = /\s+(?=(?:หาก|ถ้า|จากนั้น|ทั้งนี้|กรณี|หลังจาก|นอกจากนี้|อย่างไรก็ตาม|ส่วน|ขั้นตอนหลัก|ข้อควรจำ|ระหว่างนี้|FAQ))/;

// Split at ". " / "。", but not after an abbreviation (พ.ศ. 2569, ม.มหิดล, e.g.) or before a digit.
function sentences(line) {
  const out = []; let from = 0; const re = /[.。]\s+/g; let m;
  while ((m = re.exec(line))) {
    const before = line.slice(Math.max(0, m.index - 4), m.index), after = line[m.index + m[0].length] || '';
    if (/\d/.test(after) || /[.][^\s.]{1,3}$/.test(before) || /(?:^|\s)[^\s.]{1,2}$/.test(before)) continue;
    out.push(line.slice(from, m.index + 1)); from = m.index + m[0].length;
  }
  out.push(line.slice(from)); return out;
}

export function answerPoints(body) {
  return String(body || '').split(/\n+/)
    .map(l => l.trim().replace(/^(?:[-•*]|\d+[.)])\s+/, ''))
    .flatMap(l => sentences(l)).flatMap(x => x.split(SPLIT_BEFORE))
    .map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
}

// Slot-filling: the specific fact asked for, pulled out of the entry ("ส่งกี่วัน" -> "ภายใน 21 วัน").
const SLOTS = [
  { ask: /กี่วัน|ภายในกี่|นานแค่ไหน|กี่สัปดาห์|กี่เดือน|ระยะเวลา/, grab: /(?:ไม่เกิน|ภายใน|ประมาณ|ราว ?ๆ?)?\s*\d+\s*(?:วัน(?:ทำการ)?|สัปดาห์|เดือน)/, lead: m => `${/ไม่เกิน|ภายใน/.test(m) ? '' : 'ภายใน'}${m}` },
  { ask: /เท่าไร|เท่าไหร่|กี่บาท|ค่าใช้จ่าย|ราคา|ค่าธรรมเนียม|ค่าสอบ|ค่าตอบแทน/, grab: /\d[\d,]*\s*บาท/, lead: m => `${m}` },
  { ask: /กี่ ?%|กี่เปอร์|เกินเท่าไร|เกินกี่|ไม่เกินเท่าไร/, grab: /(?:ไม่เกิน|เกิน)?\s*\d+\s*%/, lead: m => `${m}` },
];
export function slotLead(entry, question) {
  const q = question || '', body = String(entry?.answer || '');
  for (const s of SLOTS) { if (!s.ask.test(q)) continue; const m = body.match(s.grab); if (m) return s.lead(m[0].trim().replace(/\s+/g, ' ')); }
  return '';
}

// LINE has no "อ่านเพิ่ม" fold: past `max` points the reply says where the rest is (the source link the caller appends, if any).
export function readableText(entry, question, max = 6) {
  const pts = answerPoints(entry?.answer);
  if (!pts.length) return '(ดูรายละเอียดในแหล่งอ้างอิงครับ)';
  const lead = slotLead(entry, question);
  const [first, ...rest] = pts, shown = rest.slice(0, max - 1);
  return [lead ? `👉 ${lead}` : '', first, ...shown.map(x => `• ${x}`),
    rest.length > shown.length ? `(มีรายละเอียดอีก ${rest.length - shown.length} ข้อ ${entry?.source_url ? 'ดูที่ลิงก์ด้านล่าง' : 'พิมพ์ถามต่อได้เลยครับ'})` : ''].filter(Boolean).join('\n');
}
