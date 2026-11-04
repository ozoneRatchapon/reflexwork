// "Is studying free?" is never confirmed, however it is phrased (QA F23).   Run: node tests/fee_premise.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const re = n => { const m = html.match(new RegExp(`^const ${n}=\\/(.+)\\/([a-z]*);$`, 'm')); return new RegExp(m[1], m[2]); };
const FREEQ = re('_P_FREEQ'), FREESTUDY = re('_P_FREESTUDY'), hit = q => FREEQ.test(q) && FREESTUDY.test(q);
const yes = ['ปริญญาโทเรียนฟรีจริงไหม', 'เรียนฟรีหรือเปล่า', 'มีเรียนฟรีไหม', 'is tuition free?', 'Is the master program free?', 'ป.โทฟรีไหม', 'ไม่เสียค่าเรียนใช่ไหม'];
const no = ['ส่งรูปเล่มภายในกี่วัน', 'free parking near campus', 'ฟรีวีซ่าไหม', 'Turnitin เกิน 25% ทำอย่างไร', 'เรียนไรดี'];
check('F23: free-study phrasings are caught', yes.every(hit), yes.filter(q => !hit(q)).join(' | '));
check('F23: unrelated questions are not', no.every(q => !hit(q)), no.filter(hit).join(' | '));
check('F23: the guard runs after programme resolution (a named programme keeps its fee card) and before the finder', /if\(prog\)\{[\s\S]*?_P_FREEQ\.test\(q\) && _P_FREESTUDY\.test\(q\)[\s\S]*?isCareerQuestion\(q\)[\s\S]*?isFinderQuestion\(q\)/.test(html));
check('F23: an English question gets the English premise reply', /isEnglish\(q\) \? VOICE\.feePremiseEn : VOICE\.feePremise/.test(html) && /feePremiseEn:\s+'I can\\'t say it is free/.test(html));
// QA F54 (same branch-order area): a finder question skips the resolver; no programme-name question is a finder question
{ const P = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/programmes.json'), 'utf8')).programmes;
  const FIND = re('_P_FINDQ'), OTHER = re('_P_OTHER'), isFinder = q => FIND.test(q) && !OTHER.test(q);
  const named = P.flatMap(p => [p.title, 'สมัคร ' + p.title, p.title + ' เปิดรับไหม']);
  check('F54: "list of programs" is a finder question; no programme-name question is', isFinder('list of programs') && named.every(q => !isFinder(q)), named.filter(isFinder).slice(0, 3).join(' | '));
  check('F54: the resolver is skipped for finder questions', /const prog = \(pinned \|\| staffFirst \|\| \(PROG\.length && \(?isFinderQuestion\(q\)[^?]*\) \? null : resolveProgramme\(q, PROG\);/.test(html)); }
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
