#!/usr/bin/env node
// One-page stage cheat sheet for the 5-minute pitch -> docs/pitching/cheatsheet.html (print on A4; not deployed).
// Every number comes from submissions/ui/pitch.html (data-claim spans), which tests/pitch_claims.test.mjs checks against fresh measurements,
// so the sheet cannot drift from the slides. tests/cheatsheet.test.mjs fails when the committed sheet is stale.
//   node scripts/gen_cheatsheet.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'docs/pitching/cheatsheet.html');
export function build() {
  const deck = readFileSync(join(root, 'submissions/ui/pitch.html'), 'utf8');
  const c = k => { const m = deck.match(new RegExp(`<span data-claim="${k}">([\\d,]+)</span>`)); if (!m) throw new Error('claim missing in pitch.html: ' + k); return m[1]; };
  const min = Number((deck.match(/data-min="tests">(\d+)</) || [])[1]);
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>ReflexWork - ชีตขึ้นเวที (A4)</title>
<style>
@page{size:A4;margin:9mm}
*{box-sizing:border-box}body{font:9.2pt/1.38 -apple-system,"Segoe UI","Noto Sans Thai",sans-serif;color:#111;margin:0}
h1{font-size:13pt;margin:0 0 2mm}h2{font-size:9.6pt;margin:2.2mm 0 .8mm;border-bottom:1px solid #999;padding-bottom:.4mm}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 7mm}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:.6mm 1.4mm;vertical-align:top;text-align:left}
th{background:#eee}code{font-family:ui-monospace,Menlo,monospace;font-size:8.4pt;background:#f1f1f1;padding:0 1mm}ul{margin:.3mm 0;padding-left:4.2mm}li{margin:0}
.no li{color:#a00}.ok li{color:#064}small{color:#555}.n{font-weight:700}
</style></head><body>
<h1>ReflexWork · Pitching Day 7 พ.ย. 2569 · 5 นาที <small>A เล่า · B พิมพ์ · สร้างจาก submissions/ui/pitch.html ด้วย node scripts/gen_cheatsheet.mjs</small></h1>
<div class="cols"><div>
<h2>เวลา (จบที่ 4:45)</h2>
<table><tr><th>เวลา</th><th>สไลด์</th><th>ทำอะไร</th></tr>
<tr><td>0:00–0:40</td><td>1–3</td><td>ปัญหา (Air Canada = tribunal ของแคนาดา) → ทางออก</td></tr>
<tr><td>0:40–2:50</td><td>4</td><td><b>เดโมสด 3 ช่วง</b></td></tr>
<tr><td>2:50–3:30</td><td>5</td><td>ตัวเลข + ข้อจำกัด</td></tr>
<tr><td>3:30–4:00</td><td>6</td><td>AI และ Kiro</td></tr>
<tr><td>4:00–4:40</td><td>7</td><td>พร้อมใช้ + ที่ขอ</td></tr>
<tr><td>4:40–5:00</td><td>8</td><td>ปิด + QR</td></tr></table>
<h2>เดโม — เปิด <code>reflexwork.pages.dev/chatbot?view=judge</code></h2>
<table><tr><th>#</th><th>พิมพ์</th><th>ต้องเห็น</th></tr>
<tr><td>1</td><td><code>อยากสมัครเรียนชีวสารสนเทศทางการแพทย์</code></td><td>การ์ด 🟢 เปิดรับ + กำหนดการ</td></tr>
<tr><td>2</td><td><code>แล้วค่าเทอมล่ะ</code> → ดูแผงหลักฐาน</td><td>ตารางค่าธรรมเนียมมีตัวเลข · แผงขวา: หัวข้อ คะแนน BLAKE3</td></tr>
<tr><td>3</td><td><code>ที่จอดรถสำหรับนักศึกษาอยู่ตรงไหน</code> → แดชบอร์ด “ตอบ” (คำตอบจริงที่ตรวจแล้ว) → กลับแท็บแชต → ถามซ้ำ</td><td>“ยังไม่มีในคู่มือ” → ป้าย 📝 เจ้าหน้าที่ตอบ · <b>แล้วกด “ถอน”</b></td></tr></table>
<small>แท็บสำรอง: <code>/chatbot?ai=off</code> · วิดีโอ <code>submissions/video/*.mp4</code> · ถ้าสะดุด ข้ามไปขั้นถัดไป ไม่แก้สด</small>
<h2>ตัวเลขที่พูดได้ <small>(มี test ตรวจ)</small></h2>
<ul><li><span class="n">${c('r1')}%</span> หัวข้อถูกอันดับ 1 ของ ${c('labelled')} ข้อทดสอบ · <span class="n">${c('answered')}/${c('n')}</span> ตอบเอง ผิด <span class="n">${c('wrong')}</span></li>
<li>การ์ดหลักสูตรผิด <span class="n">${c('wrongcards')}</span> จาก ${c('names')} ชื่อพิมพ์ผิด · <span class="n">${c('prog')}</span> หลักสูตร · คู่มือ ${c('kb')} หัวข้อ</li>
<li>อังกฤษถูก <span class="n">${c('enright')}%</span> · FAQ ที่คู่มือไม่มี <span class="n">${c('unc')}</span> ข้อ → ไทยผิดหัวข้อ <span class="n">${c('uncans')}</span></li>
<li><span class="n">${c('thright')}%</span> บน FAQ จริง = <b>วัดการจับคู่ ไม่ใช่คำถามใหม่</b> (คู่มือ 62 หัวข้อเขียนจาก FAQ ชุดเดียวกัน)</li>
<li>Lighthouse มือถือ ${c('lhp')} · ${c('lha')} · ${c('lhb')} · ${min}+ ชุดทดสอบ + ทดสอบเบราว์เซอร์จริง 2 engine</li></ul>
</div><div>
<h2>ห้ามพูด</h2>
<ul class="no"><li>“ไม่เดา” → พูดว่า <b>ข้อเท็จจริงมาจากคู่มือเสมอ</b></li><li>“ศาลแคนาดา” → tribunal</li><li>“405 ข้อทดสอบ” · “หลายหมื่นคนพร้อมกัน” (ไม่เคยทดสอบโหลด)</li>
<li>“Guardrail 100%” · “Kiro Hooks ทำ CI/Deploy” · “คู่มืออนุมัติแล้วทุกข้อ” (30 หัวข้อยัง draft)</li><li>“ลด 80%” / ตัวเลข ฿ เป็น <b>ประมาณการ</b> · BLAKE3 = ลายนิ้วมือ ไม่ใช่ proof</li>
<li>“มี login / ระบบดูข้อมูลส่วนตัว” (ยังไม่มี — ถามส่วนตัวแล้วระบบบอกขอบเขต)</li></ul>
<h2>ถ้ามีปัญหา</h2>
<table><tr><td>AI ช้า/ล่ม</td><td>“หน้าแสดงข้อความคู่มือไว้แล้ว” (จุดแข็ง) · ใช้แท็บ ai=off</td></tr>
<tr><td>หน้าไม่โหลด</td><td>วิดีโอสำรอง: “ขอสลับไปคลิปที่อัดไว้ครับ”</td></tr>
<tr><td>หลักสูตรเดโมสถานะเปลี่ยน</td><td>smoke ข้อ 2c จะล้มก่อนขึ้นเวที → เลือกหลักสูตรใหม่ตาม script</td></tr>
<tr><td>ถามภาษาไทยนอกเรื่อง</td><td>ระบบตอบ “จับใจความไม่ได้” + ปุ่มติดต่อ — ไม่ใช่ “นอกขอบเขต”</td></tr></table>
<h2>Q&amp;A สั้น</h2>
<ul><li><b>94% คืออะไร</b> — วัดการจับคู่; ตัวใกล้กว่า: ${c('r1')}% อันดับ 1, อังกฤษ ${c('enright')}%</li>
<li><b>คำถามที่คู่มือไม่มีตอบผิดไหม</b> — ใช่ ${c('uncans')}/${c('unc')} ข้อ ลองปรับเกณฑ์แล้วไม่ช่วย ทางแก้คือเติมคู่มือ <b>แต่ต้องตรวจหัวข้อที่ชนกัน</b> (วัดแล้ว: อนุมัติ 14 ร่างดิบๆ ทำให้ข้อเดิมบางข้อเสีย) → ที่เราขอ</li>
<li><b>ประหยัดเท่าไร</b> — ไม่มีบิลจริง; ยืนยันได้ว่าคำตอบเชิงข้อเท็จจริงไม่เรียก AI</li>
<li><b>รับโหลดได้ไหม</b> — ค้นในเบราว์เซอร์ จึงไม่เพิ่มภาระต่อคำถาม; <b>ยังไม่ทดสอบโหลด ไม่อ้างตัวเลข</b> (docs/scaling-plan.md)</li>
<li><b>login / ข้อมูลส่วนตัว</b> — ยังไม่มี; ถามเรื่องของตัวเองระบบบอกขอบเขต + ช่องทาง; ของเพื่อน → ปฏิเสธ · แนวคิด: นักศึกษาเฉพาะของตัวเอง เจ้าหน้าที่เฉพาะหลักสูตร สิทธิ์ตัดสินที่เซิร์ฟเวอร์</li>
<li><b>เรียนรู้เองไหม</b> — ไม่มีโมเดลให้ train; วงจร gap → เจ้าหน้าที่ตอบ → ขึ้นแชต; โหวตชี้หัวข้ออ่อน (ผลต่อคุณภาพยังไม่วัด)</li>
<li><b>PDPA</b> — ประวัติแชตอยู่ในแท็บผู้ใช้; ตัดอีเมล/เลขรหัสก่อนบันทึก; เรื่องบัญชีไม่บันทึก</li></ul>
<h2>T-30 นาที</h2>
<ul><li><code>node scripts/demo_smoke.mjs</code> ต้อง “all hard checks passed” (และ <code>--mobile</code>)</li><li>เปิดไว้: แชต · แท็บ ai=off · สไลด์ <code>/pitch</code> · แดชบอร์ด + staff token · hotspot มือถือ</li>
<li>ซ้อมถอนคำตอบช่วง 3 · จับเวลาจริง 3 รอบ</li>
<li><b>ห้าม</b> <code>deploy_pages.sh main</code> / deploy worker จนพิตช์จบ · พัฒนาต่อบน preview (<code>docs/dev-preview.md</code>)</li></ul>
</div></div></body></html>
`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = build();
  if (process.argv.includes('--check')) { const cur = readFileSync(out, 'utf8'); if (cur !== html) { console.error('cheatsheet.html is stale: run node scripts/gen_cheatsheet.mjs'); process.exit(1); } console.log('cheatsheet.html is up to date'); }
  else { writeFileSync(out, html); console.log('wrote', out); }
}
