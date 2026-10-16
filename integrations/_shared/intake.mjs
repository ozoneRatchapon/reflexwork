// ReflexWork — Intake layer (deterministic, no AI)
// ----------------------------------------------------------------------------
// Observed from real LINE OA traffic: most messages are NOT FAQ-style knowledge
// questions ("how many days to submit?") but PERSONAL / TECHNICAL issues tied to
// one individual ("MY account is locked", "MY data is stuck", "I can't log in").
// The KB cannot answer those — the right move is to hand them to a human. But in
// the real chats staff had to ask the same follow-ups EVERY time ("your name?",
// "which system?", "staff or student?"), wasting a round-trip per case.
//
// This module does the collecting FOR the staff, deterministically and with no
// AI: it recognises a personal/technical issue, routes it to a category, and
// produces a short intake prompt listing exactly the fields IT needs. The user
// fills them once; staff receive a complete ticket-like summary and can act
// immediately — without us building a ticket system (LINE's own chat IS the
// hand-off channel).
//
//   classifyIssue(text)      → {kind, category, label} | null   (null = not a personal issue)
//   intakePrompt(category)   → the Thai message asking for the fields
//   INTAKE_FIELDS            → the canonical field set, reused by web + LINE
// ----------------------------------------------------------------------------

// The fields staff repeatedly asked for across the observed cases. Kept small —
// just enough for IT to act without a second round-trip.
export const INTAKE_FIELDS = [
  'ชื่อ-นามสกุล',
  'รหัสนักศึกษา / username / อีเมลมหาวิทยาลัย',
  'ระบบที่มีปัญหา (เช่น WE Mahidol, Student Card App, e-Thesis, ระบบลงทะเบียน)',
  'อาการ / ข้อความ error ที่เจอ (แนบภาพหน้าจอได้)',
];

// Issue categories seen in real traffic, each with the trigger patterns and a
// human label. Order matters: the first category whose pattern matches wins.
const CATEGORIES = [
  {
    category: 'login',
    label: 'เข้าระบบ/ล็อกอินไม่ได้',
    // login / password / account verification problems (TH + EN, incl. app names)
    re: /ล็อก ?อิน|เข้าระบบ(?:ไม่ได้)?|เข้า ?(?:แอป|app)|ลืมรหัส|รหัสผ่าน|รีเซ็ต ?รหัส|ยืนยันตัวตน|บัญชี(?:ถูก)?ล็อก|login|log ?in|sign ?in|password|forgot ?password|reset|account|server ?error|we ?mahidol|student ?card/i,
  },
  {
    category: 'data_stuck',
    label: 'ข้อมูล/สถานะค้างในระบบ',
    // data not updating / stuck records / status mismatch
    re: /(?:ข้อมูล|รายชื่อ|สถานะ|ชื่อ).{0,12}(?:ค้าง|ไม่อัปเดต|ไม่อัพเดต|ไม่ขึ้น|หาย|ไม่ตรง|ผิด)|ยังมีรายชื่อ|ติดอยู่ในระบบ|stuck|not ?updat|pending.*(?:system|ระบบ)/i,
  },
  {
    category: 'system_error',
    label: 'ระบบขัดข้อง/ใช้งานไม่ได้',
    // generic "the system is broken / can't do X in the system"
    re: /ระบบ.{0,16}(?:error|ขัดข้อง|ล่ม|พัง|ใช้ ?ไม่ ?ได้|มีปัญหา|ไม่ทำงาน|ไม่ได้)|กดไม่ได้|(?:ใส่|กรอก|เลือก|เพิ่ม)(?:ชื่อ)?.{0,12}ไม่ได้|บันทึกไม่ได้|อัปโหลดไม่ได้|system ?(?:error|down|broken)/i,
  },
];

// Negative guard: a few phrasings LOOK personal but are really FAQ knowledge
// questions the KB should answer. Keep them on the FastPath, not intake.
const NOT_PERSONAL = /กี่วัน|กี่บาท|เท่าไร|เท่าไหร่|ค่าสอบ|ค่าธรรมเนียม|turnitin|กี่ ?%|เงื่อนไข|คุณสมบัติ/i;

/**
 * Classify a message as a personal/technical issue (needs a human + intake),
 * or return null when it is an ordinary knowledge question.
 * Pure string logic — deterministic, 0 token, microseconds.
 */
export function classifyIssue(text) {
  const q = String(text || '');
  if (!q.trim()) return null;
  if (NOT_PERSONAL.test(q)) return null;
  for (const c of CATEGORIES) {
    if (c.re.test(q)) return { kind: 'personal', category: c.category, label: c.label };
  }
  return null;
}

/**
 * The intake prompt (Thai) for a given category. Asks the user to provide the
 * canonical fields in one message, so staff get a complete summary.
 */
export function intakePrompt(category) {
  const cat = CATEGORIES.find(c => c.category === category);
  const head = cat
    ? `ดูเหมือนเป็นปัญหา “${cat.label}” ซึ่งเป็นเรื่องเฉพาะบัญชี/ข้อมูลของคุณ เจ้าหน้าที่จะช่วยดูแลให้ครับ 🙇`
    : `ดูเหมือนเป็นปัญหาเฉพาะบัญชี/ข้อมูลของคุณ เจ้าหน้าที่จะช่วยดูแลให้ครับ 🙇`;
  const fields = INTAKE_FIELDS.map((f, i) => `${i + 1}. ${f}`).join('\n');
  return `${head}\n\nเพื่อให้เจ้าหน้าที่ช่วยได้เร็วขึ้น รบกวนแจ้งข้อมูลต่อไปนี้ในข้อความเดียวนะครับ:\n${fields}\n\nเมื่อได้รับข้อมูลครบ เจ้าหน้าที่จะมาตอบในแชทนี้ต่อให้ครับ`;
}
