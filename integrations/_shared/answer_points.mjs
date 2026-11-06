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

// "ส่วน" and "FAQ" are not split words (QA F17): they begin noun phrases and left bare "ส่วน" / "หน้า" points.
const SPLIT_BEFORE = /\s+(?=(?:หาก|ถ้า|จากนั้น|ทั้งนี้|กรณี|หลังจาก|นอกจากนี้|อย่างไรก็ตาม|ขั้นตอนหลัก|ข้อควรจำ|ระหว่างนี้))/;

// A label line ending in ":" keeps its value: the next plain line, or a run of at most LABEL_RUN bullet lines joined with
// " · " while the point stays within LABEL_MAX characters. A "▪" header or another label is never pulled in (QA F17).
const LABEL_MAX = 120, LABEL_RUN = 2;
const unmark = l => l.replace(/^(?:[-•*]|\d+[.)])\s+/, '');
function joinLabels(lines) {
  const out = [], bullet = l => /^[-•*]\s+/.test(l || ''), stop = l => !l || /^▪/.test(l) || /[:：]$/.test(l);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (/[:：]$/.test(l) && !stop(lines[i + 1])) {
      if (!bullet(lines[i + 1])) l += ' ' + unmark(lines[++i]);
      else {
        let k = 0; while (bullet(lines[i + 1 + k]) && !stop(lines[i + 1 + k])) k++;
        const joined = l + ' ' + lines.slice(i + 1, i + 1 + k).map(unmark).join(' · ');
        if (k <= LABEL_RUN && joined.length <= LABEL_MAX) { l = joined; i += k; }
      }
    }
    out.push(l);
  }
  return out;
}

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
  return joinLabels(String(body || '').split(/\n+/).map(l => l.trim()))
    .map(unmark)
    .flatMap(l => sentences(l)).flatMap(x => x.split(SPLIT_BEFORE))
    .map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
}

// Slot-filling: the specific fact asked for, pulled out of the entry ("ส่งกี่วัน" -> "ภายใน 21 วัน"). Same rules as the page (QA F17):
// "นานเท่าไร"/"ใช้เวลา" ask a duration; a deadline question naming a fee asks a date; several amounts -> no money lead.
const SLOTS = [
  { ask: /กี่วัน|ภายในกี่|นานแค่ไหน|นานเท่าไร|นานเท่าไหร่|นานไหม|ใช้เวลา|กี่สัปดาห์|กี่เดือน|ระยะเวลา/, grab: /(?:ไม่เกิน|ภายใน|ประมาณ|ราว ?ๆ?)?\s*(?<!\d)\d{1,3}\s*(?:วัน(?:ทำการ)?|สัปดาห์|เดือน)/, lead: m => /^\d/.test(m) ? `ภายใน ${m}` : m.replace(/^(ไม่เกิน|ภายใน|ประมาณ)(?=\d)/, '$1 ') },
  { ask: /เท่าไร|เท่าไหร่|กี่บาท|ค่าใช้จ่าย|ราคา|ค่าธรรมเนียม|ค่าสอบ|ค่าตอบแทน/, not: /นานเท่าไ|วันสุดท้าย|วันไหน|เมื่อไร|เมื่อไหร่|กี่วัน/, unless: /กี่บาท|ราคา|ค่า\S*เท่าไ/, grab: /\d[\d,]*\s*บาท/, single: true, lead: m => `${m}` },
  { ask: /กี่ ?%|กี่เปอร์|เกินเท่าไร|เกินกี่|ไม่เกินเท่าไร/, grab: /(?:ไม่เกิน|เกิน)?\s*\d+\s*%/, lead: m => `${m}` },
];
export function slotLead(entry, question) {
  const q = question || '', body = String(entry?.answer || '');
  for (const s of SLOTS) {
    if (!s.ask.test(q) || (s.not && s.not.test(q) && !s.unless.test(q))) continue;
    const all = body.match(new RegExp(s.grab.source, 'g')); if (!all) continue;
    if (s.single && new Set(all.map(x => x.replace(/[\s,]/g, ''))).size > 1) continue;
    return s.lead(all[0].trim().replace(/\s+/g, ' '));
  }
  return '';
}

// LINE has no "อ่านเพิ่ม" fold: past `max` points the reply says where the rest is (the source link the caller appends, if any).
export function readableText(entry, question, max = 6) {
  const pts = answerPoints(entry?.answer);
  if (!pts.length) return '(ดูรายละเอียดในแหล่งอ้างอิงครับ)';
  const lead = slotLead(entry, question);
  // a "▪" section header is never the answer line (QA F17): it stays as a plain sub-heading line, without a bullet
  const head = /^▪\s*/, li = Math.max(0, pts.findIndex(x => !head.test(x)));
  const first = pts[li], rest = pts.slice(li + 1), shown = rest.slice(0, max - 1);   // everything before li is a header
  return [lead ? `👉 ${lead}` : '', ...pts.slice(0, li).map(x => x.replace(head, '')), first, ...shown.map(x => head.test(x) ? x.replace(head, '') : `• ${x}`),
    rest.length > shown.length ? `(มีรายละเอียดอีก ${rest.length - shown.length} ข้อ ${entry?.source_url ? 'ดูที่ลิงก์ด้านล่าง' : 'พิมพ์ถามต่อได้เลยครับ'})` : ''].filter(Boolean).join('\n');
}
