// The "nothing in the manual matched" fallback opens the TUITION finder only for tuition questions; exam / service / procurement fees
// do not (found by benchmark/rules/branch_hits.mjs, 002). Checked on the Rust route (plan 015 step 3b).
// Run: node tests/tuition_scope.test.mjs
import { routeOf } from '../scripts/lib/rust_route.mjs';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const TUITION_ROUTES = ['generic_fee', 'tuition_finder_nomatch'];
for (const q of ['ค่าเทอมเท่าไหร่', 'อยากรู้ว่าค่าเทอมที่นี่เป็นยังไงบ้าง', 'ค่าเล่าเรียนปริญญาโท', 'tuition fee', 'how much is the fee', 'ค่าธรรมเนียมเท่าไร', 'ค่าใช้จ่ายเท่าไหร่'])
  check(`tuition: "${q}"`, TUITION_ROUTES.includes(routeOf(q)), `route ${routeOf(q)}`);
for (const q of ['What is the fee for taking the TOEFL ITP?', 'What are the MU GRAD Plus examination fees?',
  'ค่าใช้จ่ายอื่นๆ ที่มาพร้อมกับการซื้อวัสดุหรือจ้าง เช่น ค่าขนส่ง ประกัน ภาษี สามารถเบิกผ่านได้ไหม', 'ค่าธรรมเนียมการโอนเงินต่างธนาคาร', 'ค่าสมัครสอบ TOEFL'])
  check(`not tuition: "${q.slice(0, 50)}"`, !TUITION_ROUTES.includes(routeOf(q)), `route ${routeOf(q)}`);
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
