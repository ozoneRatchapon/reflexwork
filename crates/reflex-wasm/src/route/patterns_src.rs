//! Regexes of the first branches of the chat's decision order, copied from chatbot.html (2026-11-07) and owned HERE from now on: the
//! page will call this module instead of keeping its own copy (plan 009). Two patterns had a lookahead, which `regex-lite` lacks; each is
//! rewritten to an equivalent for a yes/no test (`X(?!c)` -> `X(?:[^c]|$)`; the match is never read back, only whether it exists).
use crate::re::Re;

pub const PERS_RECORD: Re = Re { src: r#"ผลสอบ|ผลการเรียน|ผลการสอบ|เกรด|GPA|คะแนน|สถานะ|คำร้อง|ค้างจ่าย|ค้างชำระ|ยอดค้าง|ยอดเงิน|ที่ปรึกษา|กรรมการสอบ|หน่วยกิต|สอบผ่าน|สอบตก|จบ|ได้ทุน|ใบเสร็จ|ลงทะเบียน"#, flags: "i" };
pub const PERS_STATUSQ: Re = Re { src: r#"เท่าไร|เท่าไหร่|เท่าใด|หรือยัง|หรือเปล่า|คือใคร|ถึงไหน|ครบหรือยัง|ค้างอยู่|เป็นยังไง|เป็นอย่างไร|กี่หน่วยกิต|ผ่านไหม|ผ่านมั้ย|ตกไหม|ได้ทุนไหม"#, flags: "" };
pub const PERS_HOWTO: Re = Re { src: r#"ที่ไหน|อย่างไร|ยังไง|ทำไง|วิธี|ขั้นตอน|ต้อง|ควร|เมื่อไร|เมื่อไหร่|กี่วัน|กำหนด|เกณฑ์|ได้ไหม|ได้หรือไม่|เงื่อนไข|ทำได้|ขอได้|จะ|ถ้า|หาก"#, flags: "" };
pub const PERS_SELF: Re = Re { src: r#"ผม|ฉัน|ดิฉัน|หนู|กระผม"#, flags: "" };
pub const PERS_OWN: Re = Re { src: r#"(?:สถานะ|ผล(?:สอบ|การเรียน|การสอบ)?|เกรด|คะแนน|ยอด[ก-๙]*|ที่ปรึกษา|คำร้อง)[^\n]{0,20}ของ(?:ผม|ฉัน|ดิฉัน|หนู)"#, flags: "" };
// JS: เขา(?![ก-๙])  ->  เขา(?:[^ก-๙]|$)
pub const PERS_OTHER: Re = Re { src: r#"เพื่อน|น้อง|รุ่นพี่|ลูกศิษย์|ลูก(?:ชาย|สาว)?ของ|แฟน|นักศึกษาคนอื่น|คนอื่น|เขา(?:[^ก-๙]|$)|เธอ|\b\d{7,10}\b"#, flags: "" };
pub const PERS_OTHER_REC: Re = Re { src: r#"ผล|เกรด|คะแนน|สถานะ|คำร้อง|ข้อมูล|ประวัติ|ค้าง|ที่ปรึกษา|สอบ"#, flags: "" };
pub const HAS_TOPIC: Re = Re { src: r#"ค่าเทอม|ค่าเล่าเรียน|ค่าธรรมเนียม|ค่าใช้จ่าย|ค่าสอบ|ทุน|หลักสูตร|สาขา|สมัคร|ลงทะเบียน|วิทยานิพนธ์|turnitin|tuition|\bfees?\b|programme|scholarship"#, flags: "i" };
pub const LEAD_IN: Re = Re { src: r#"^\s*(?:สวัสดี|หวัดดี|ขอบคุณ|ขอบใจ|hello|hi|hey|thanks?)(?:ครับ|ค่ะ|คะ|จ้า|นะ|ฮะ|เลย)*\s*(?:ค่ะ|ครับ|แล้ว|ว่า)?\s*[,!]?\s*"#, flags: "i" };
pub const OVERVIEW: Re = Re { src: r#"^(?:มี)?อะไร(?:บ้าง)?(?:ที่)?(?:น่าสนใจ|น่ารู้|ควรรู้|ต้องรู้)|^(?:ต้อง|ควร)รู้อะไร(?:บ้าง)?(?:ไหม)?$|^(?:ต้อง|ควร)รู้(?:อะไร)?บ้าง$|^(?:มี)?(?:อะไร)?น่าสนใจ(?:บ้าง|ไหม|อะไร)?$|^เริ่มต้น(?:ยังไง|อย่างไร|ตรงไหน)?$|^whatshouldiknow$|^anythinginteresting$"#, flags: "" };
pub const RESTART: Re = Re { src: r#"^(?:ยกเลิก|เริ่มใหม่|ข้าม|ไม่รู้|ถามเรื่องอื่น|ไม่เอา|ช่างมัน)(?:ครับ|ค่ะ|คะ|นะ|เลย)*$"#, flags: "" };
pub const WB_CRISIS: Re = Re { src: r#"ฆ่าตัวตาย|อยากตาย|ไม่อยากมีชีวิต|ทำร้ายตัวเอง|ล่วงละเมิด|ข่มขืน|คุกคามทางเพศ|suicid|kill myself|self.?harm"#, flags: "i" };
// JS: ท้อ(?!ง)  ->  ท้อ(?:[^ง]|$)
pub const WB_STRESS: Re = Re { src: r#"ซึมเศร้า|เครียด|ท้อ(?:[^ง]|$)|หมดไฟ|เหนื่อยมาก|เหนื่อยจัง|เรียนไม่ไหว|ไม่ไหวแล้ว|อยากเลิกเรียน|วิตกกังวล|นอนไม่หลับ|depress|burn.?out|overwhelm"#, flags: "i" };

// hasStudyIntent (chatbot.html): the programme-path signal. JS `สมัคร(?!สอบ)` is handled in code: "สมัครสอบ" is blanked out first (see study_intent.rs).
pub const NOT_STUDY: Re = Re { src: r#"พัก(?:การ)?เรียน|ผลการเรียน|ตารางเรียน|(?:ยัง|กำลัง)เรียน(?:อยู่|ไม่จบ)?|ระหว่างเรียน|เรียนไม่จบ|เรียน(?:วัน)?เสาร์|นั่งเรียน|เรียนออนไลน์|(?:ฝ่าย|งาน|เจ้าหน้าที่)รับสมัคร|ภาพรวมการสมัคร|ปฏิทินการศึกษา|จบการศึกษา|ลาศึกษา|ใบปริญญา|ปริญญาบัตร|(?:ระบบ)?(?:ทวิภาค|ไตรภาค)(?:เรียน)?|ระบบการศึกษา|เรียนระบบ"#, flags: "" };   // global in the page: used with replace_all
pub const STUDY_WORDS: Re = Re { src: r#"เรียน|ศึกษาต่อ|เข้าศึกษา|สมัคร|หลักสูตร|สาขา|คณะ|ปริญญา|ป\.\s?(?:โท|เอก)|ต่อโท|ต่อเอก|master|ph\.?\s?d|program|course|study|apply"#, flags: "i" };
pub const CAREER_OR_OPEN: Re = Re { src: r#"เรียนไรดี|ทำงานอะไรดี|หลักสูตร|เปิดรับสมัคร"#, flags: "" };   // the extra words that also trigger the catalogue notice

// Fee-question helpers (chatbot.html `_P_FREEQ`, `_P_ASPECT`, `followUpAspect`, `isGenericFeeQuestion`), copied 2026-11-07.
pub const FREE_Q: Re = Re { src: r#"ฟรี|ไม่เสียค่า|ไม่มีค่า(?:ใช้จ่าย|เทอม|ธรรมเนียม)|เรียนฟรี|free of charge|\bfree\b"#, flags: "i" };
pub const ASPECT_DOCS: Re = Re { src: r#"เอกสาร|หลักฐาน|ใช้อะไรบ้าง|documents?"#, flags: "i" };
pub const ASPECT_ELIG: Re = Re { src: r#"คุณสมบัติ|จบ(?:อะไร|สาขา|ป\.?ตรี)|เกรดเฉลี่ย|\bgpa\b|eligib|requirements?"#, flags: "i" };
pub const ASPECT_ENGLISH: Re = Re { src: r#"ภาษาอังกฤษ|อังกฤษ|toefl|ielts|english"#, flags: "i" };
pub const ASPECT_SCHEDULE: Re = Re { src: r#"สอบ|สัมภาษณ์|ประกาศผล|กำหนดการ|ปิดรับวัน|สมัครได้ถึง|ถึงวันไหน|วันไหน|เมื่อไหร่|เมื่อไร|deadline|interview|schedule|รอบ"#, flags: "i" };
pub const ASPECT_STATUS: Re = Re { src: r#"เปิดรับ|ปิดรับ|เปิด(?:หรือ)?ยัง|ยังเปิด|รับกี่คน|จำนวนรับ|รับ(?:สมัคร)?(?:อยู่)?ไหม|\bopen\b"#, flags: "i" };
pub const PROGRAMME_CODE: Re = Re { src: r#"\d{4}[MDNC]\d{2}[GS]"#, flags: "i" };
pub const GENERAL_WORDS: Re = Re { src: r#"มหิดล|บัณฑิตวิทยาลัย|ทั่วไป|ทุกหลักสูตร|mahidol"#, flags: "i" };
pub const FEE_WORDS: Re = Re { src: r#"ค่าธรรมเนียมการศึกษา|ค่าธรรมเนียม|ค่าเทอม|ค่าเล่าเรียน|ค่าใช้จ่าย|ค่าเรียน|เหมาจ่าย|tuition|fees?"#, flags: "" };
pub const FEE_FILLER: Re = Re { src: r#"เท่าไหร่|เท่าไร|เท่าใด|กี่บาท|โดยทั่วไป|ทั่วไป|ปกติ|ปริญญา(?:โท|เอก)|ป\.?(?:โท|เอก)|โท|เอก|ระดับ|หลักสูตร|ไหม|มั้ย|มี|ครับ|ค่ะ|คะ|นะ|หน่อย|ขอ|อยากรู้|ของ|ที่นี่|ปี|ละ|ล่ะ|แล้ว|how much|is|the|what|are|for|master'?s?|phd|doctoral?"#, flags: "" };

// Programme-path helpers (chatbot.html `_P_FINDQ`, `_P_LEVEL_FILL`, `_P_EN_ASK`, `_P_EN_FILL`), copied 2026-11-07.
pub const FINDQ: Re = Re { src: r#"(?:เรียน|ศึกษาต่อ|ต่อ(?:โท|เอก)|สาขา|หลักสูตร|คณะ)\s*(?:อะไร|ไร|ไหน)\s*ดี|ไม่รู้จะเรียน|แนะนำ(?:หลักสูตร|สาขา|คณะ|ที่เรียน)|(?:มี|เปิด(?:รับ)?)\s*(?:หลักสูตร|สาขา|คณะ)\s*(?:อะไร|ไหน)(?:บ้าง)?|หลักสูตร(?:ทั้งหมด|อะไรบ้าง)|หลักสูตรที่เปิด(?:รับ)?(?:สมัคร)?(?:มี)?(?:อะไร)?บ้าง|what should i study|which (?:program|course)s?|list of programs?"#, flags: "i" };
pub const LEVEL_FILL: Re = Re { src: r#"นานาชาติ|international|ภาคพิเศษ|special\s*program(?:me)?s?|ที่?เปิด(?:รับ)?(?:สมัคร)?|หลักสูตร|ระดับ|มี|อะไร|บ้าง|ไหน|ทั้งหมด|ครับ|ค่ะ|คะ|หน่อย|programs?|programmes?|courses?"#, flags: "i" };   // global in the page: used with replace_all
pub const EN_FILL: Re = Re { src: r#"\b(?:is|are|it|the|a|an|for|of|to|in|on|when|what|which|date|dates|day|time|does|do|still|now|currently|open|apply|applications?|admission|accepting|interviews?|exams?|examination|schedule|deadline|results?)\b"#, flags: "i" };   // global in the page: used with replace_all
pub const EN_ASK_SCHEDULE: Re = Re { src: r#"\binterviews?\b|\bexams?\b|\bexamination\b|\bschedule\b|\bdeadline\b|\bresults?\b"#, flags: "i" };
pub const EN_ASK_STATUS: Re = Re { src: r#"\bopen\b|\bapply\b|\bapplications?\b|\baccepting\b"#, flags: "i" };

// Fee / career branches (chatbot.html `_P_TUITION`, `_P_NONTUITION`, `_P_CAREER`, `_P_FREESTUDY`), copied 2026-11-07.
pub const TUITION: Re = Re { src: r#"ค่าธรรมเนียมการศึกษา|ค่าเทอม|ค่าเล่าเรียน|ค่าเรียน|เหมาจ่าย|tuition"#, flags: "i" };
pub const NONTUITION: Re = Re { src: r#"\b(?:exam(?:ination)?s?|tests?|toefl|ielts|toeic|mu\s?grad|application|transfer|late|fine|penalty)\b|สอบ|สมัคร|โอนเงิน|ค่าปรับ|ปรับ|ซื้อ|จ้าง|เบิก|ขนส่ง|ภาษี"#, flags: "i" };
pub const CAREER: Re = Re { src: r#"ทำงานอะไร|งานอะไรดี|งานไหนดี|อาชีพ|สายงาน|ตำแหน่งงาน|อยากทำงาน|หางาน|เปลี่ยนสายงาน|(?:พัฒนา|เพิ่ม|เรียนรู้).{0,12}(?:skill|ทักษะ|สกิล)|(?:skill|ทักษะ|สกิล).{0,6}(?:อะไร|ไหนดี)|อยากทำ(?:งาน)?เกี่ยวกับ|อยากทำงานสาย|career"#, flags: "i" };
pub const FREESTUDY: Re = Re { src: r#"(?:เรียน|ศึกษา|ปริญญา(?:โท|เอก)?|หลักสูตร|ป\.(?:โท|เอก)).{0,12}ฟรี|ฟรี.{0,8}(?:เรียน|ศึกษา)|ไม่เสียค่า(?:เรียน|ใช้จ่าย|เทอม)|(?:tuition|study|studying|degree|master'?s?|program(?:me)?)\b.{0,12}\bfree\b"#, flags: "i" };

// Time-intent branch (chatbot.html `_TIME_W`, `_TIME_REST`, `_SNAPSHOT_RE`), copied 2026-11-07.
pub const TIME_W: Re = Re { src: r#"ตอนนี้|วันนี้|ขณะนี้|เทอมนี้|ภาคนี้|ปีนี้|ยังทัน|ทัน(?:ไหม|มั้ย|มั๊ย|อยู่)|หรือยัง|ผ่าน(?:ไป)?แล้ว"#, flags: "" };
pub const TIME_REST: Re = Re { src: r#"ตอนนี้|วันนี้|ขณะนี้|เทอมนี้|ภาคนี้|ปีนี้|หรือยัง|ผ่าน(?:ไป)?แล้ว|ยัง|ทัน|ลงทะเบียน|เรียน|ล่าช้า|รับสมัคร|สมัคร|ตัดรอบ|ปิดรับ|เปิดรับ|เปิด|ปิด|หมดเขต|ภาคการศึกษา|ภาคเรียน|เทอม|กำหนดการ|วันสุดท้าย|รอบ|ช่วง|อยู่|ใน|ได้|ไหม|มั้ย|มั๊ย|อะไร|วันไหน|เมื่อไหร่|เมื่อไร|ถึง|แล้ว|หรือ|ไหน|ครับ|ค่ะ|คะ|นะ|จ้า|เรา|ผม|หนู|ฉัน|จะ|ของ|ที่|คือ|เป็น|ตอน|บ้าง|วันที่|\d+|[ก-ฮ]{1,2}\.(?:[ก-ฮ]\.)?|[\s?!.,]"#, flags: "g" };
pub const SNAPSHOT: Re = Re { src: r#"เก็บวันที่|ข้อมูล ณ|ประกาศ ณ"#, flags: "" };

// `_P_ACK` (chatbot.html, `isNotAQuestion`): a bare acknowledgement, copied 2026-11-07.
pub const P_ACK: Re = Re { src: r#"^(?:ok(?:ay)?|k|yes|no|yep|nope|ya|yeah|hmm+|lol|test(?:ing)?|f+u+c*k+(?:\s*(?:you|u|off))?|wtf|shit)\W*$"#, flags: "i" };

// `_P_CORE_DROP` (chatbot.html, `nearSpelling`): the words a programme-name slip is judged without, copied 2026-11-07. Global in the page.
pub const P_CORE_DROP: Re = Re { src: r#"ครับ|ค่ะ|คะ|นะ|หน่อย|ยังไง|อย่างไร|ไหม|มั้ย|ได้|อยาก|เรียน(?:ต่อ)?|สมัคร|สาขา(?:วิชา)?|หลักสูตร|ป\.?\s?(?:โท|เอก)|ปริญญา(?:โท|เอก)|[\s?!.,]"#, flags: "" };

// `_TOPIC_HEAD` / `_TOPIC_TAIL` (chatbot.html, `topicCore`): the request words stripped from both ends of a topic question, copied 2026-11-07.
pub const TOPIC_HEAD: Re = Re { src: r#"^(?:อยากได้|อยากรู้|อยาก|ขอ|มี|สอบถาม|ถามเรื่อง|เรื่อง|รบกวน)+"#, flags: "" };
pub const TOPIC_TAIL: Re = Re { src: r#"(?:ทำยังไง|ทำไง|ยังไง|อย่างไร|ไหม|มั้ย|มั๊ย|บ้าง|อะไร|หน่อย|ครับ|ค่ะ|คะ|นะ|ได้|ที่ไหน|ไหน|เมื่อไหร่|ด้วย|เรียน)+$"#, flags: "" };
