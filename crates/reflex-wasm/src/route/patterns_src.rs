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
