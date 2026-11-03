// The stage deck (submissions/ui/pitch.html) must stay short, honest and tied to the measurements. Run: node tests/pitch_deck.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const html = read('submissions/ui/pitch.html');
const slides = [...html.matchAll(/<section class="slide">([\s\S]*?)<\/section>/g)].map(m => m[1]);
const text = s => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
check('8 slides for a 5-minute talk', slides.length === 8, String(slides.length));
const words = slides.map(s => text(s).split(' ').filter(Boolean).length);
check('every slide has at most 45 words (one idea per slide)', words.every(n => n <= 45), words.join(','));
const all = text(html);
const BAN = [[/ไมโครวินาที|นาโนวินาที|\bµs\b/, 'microsecond boast'], [/BLAKE3/i, 'BLAKE3 on stage (say fingerprint in Q&A)'], [/neuro-?symbolic/i, 'neuro-symbolic'], [/\bproof\b/i, 'proof'], [/ลด\s*~?\s*80\s*%|80\s*%/, 'the unmeasured 80%'],
  [/ยิ่งใช้ยิ่งฉลาด|self-learning/i, 'learns-by-itself claim'], [/bit-for-bit/i, 'bit-for-bit claim'], [/tunnel/i, 'tunnel token (removed)'], [/ทำงานในเบราว์เซอร์ 100%|ข้อมูลไม่ออกนอกเครื่อง/, 'data never leaves the device'], [/federated|Federated/, 'federated corpus as a result'], [/Bedrock/, 'Bedrock (confirm with the team before claiming)']];
for (const [re, label] of BAN) check(`deck does not contain: ${label}`, !re.test(all));
check('the next steps are labelled as concept / not built', /แนวคิด ยังไม่ได้พัฒนา/.test(all));
check('the known limits are on the evidence slide', /ข้อจำกัดที่เรารู้/.test(slides[4] || '') && /50%/.test(slides[4] || ''));
// numbers on the evidence slide are tied to the measurements
const faq = JSON.parse(read('benchmark/field/faq_questions.json')).items.filter(x => x.student);
const covered = faq.filter(x => x.gold_kb_ids.length).length;
check(`71/85: the deck says ${covered}/${faq.length}`, new RegExp(`>${covered}<span[^>]*>/${faq.length}<`).test(slides[4] || ''), `${covered}/${faq.length}`);
const th = JSON.parse(read('benchmark/field/results/e2e_th_2026-11-03.json')).filter(x => x.covered);
const right = th.filter(x => x.kind === 'right entry').length, pct = Math.round(100 * right / th.length);
check(`94%: live-page Thai result is ${right}/${th.length} = ${pct}%`, new RegExp(`>${pct}%<`).test(slides[4] || ''), `${pct}%`);
const prog = JSON.parse(read('submissions/ui/programmes.json')).count;
check(`379: the catalogue has ${prog} programmes`, new RegExp(`>${prog}<`).test(slides[4] || '') && new RegExp(`${prog} หลักสูตร`).test(slides[2] || ''), String(prog));
check('the QR code is a local file (no third-party service) and exists', /src="\.\/pitch-qr\.svg"/.test(html) && existsSync(join(root, 'submissions/ui/pitch-qr.svg')) && !/api\.qrserver\.com/.test(html));
check('the old deck is kept for reference', existsSync(join(root, 'submissions/ui/pitch-old.html')));
check('the AI/Kiro slide only claims what is in the repo (.kiro/ exists)', existsSync(join(root, '.kiro/specs')) && /\.kiro\//.test(slides[5] || ''));
check('the backup demo link is the ai=off mode', /chatbot\?ai=off/.test(html));
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
