// Robustness of the chat front door in submissions/ui/chatbot.html: sloppy typing, and never ending on "no answer".
// Run: node tests/chat_robust.test.mjs   (exit 0 = pass, 1 = fail)
//   - normChat: elongated Thai letters / zero-width characters are cleaned before matching; trailing ?!.~, emoji and fullwidth ASCII are folded (F28); nothing else is touched
//   - resolveProgramme: a study-ish question we cannot resolve finds no programme (study intent is Rust's: crates/reflex-wasm/tests/route_predicates.rs)
//   - starterEntries: the "try these" chips for a question we did not understand always answer when tapped
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shippedWasm } from '../scripts/lib/chatbot_fns.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const block = n => { const m = html.match(new RegExp(`// <${n}>([\\s\\S]*?)// </${n}>`)); check(`<${n}> block found`, m); if (!m) process.exit(1); return m[1]; };
const { normChat } = new Function(block('chat-normalize') + '\nreturn {normChat};')();
const { resolveProgramme } = new Function('WASM', 'ENG', block('linkify') + block('programme-resolve') + '\nreturn {resolveProgramme};')(shippedWasm(), {});

// --- sloppy typing ------------------------------------------------------------------------------------------------
const cases = [['เรียนรายยย', 'เรียนราย'], ['ขอบคุณครับบบบบ', 'ขอบคุณครับ'], ['ได้้้้ไหม', 'ได้ไหม'], ['จ้าาาา', 'จ้า'],
  ['  ค่าเทอม​เท่าไร  ', 'ค่าเทอมเท่าไร'], ['ค่าสมัคร    500   บาท', 'ค่าสมัคร 500 บาท']];
const badN = cases.filter(([i, o]) => normChat(i) !== o).map(([i, o]) => `${i} -> ${normChat(i)} (want ${o})`);
check('elongated Thai letters, zero-width characters and extra spaces are cleaned', badN.length === 0, badN.join(' ; '));
const keep = ['ค่าสมัคร 10000 บาท', 'www.mahidol.ac.th', 'WWW test', 'ทำไมถึงเป็นอย่างนั้น', 'กก', 'ๆ', '5555', 'MU GRAD Plus'];
check('digits, Latin letters and ordinary Thai words are never altered', keep.every(k => normChat(k) === k), keep.filter(k => normChat(k) !== k).map(k => `${k} -> ${normChat(k)}`).join(' ; '));
check('null / undefined / empty are safe', normChat(null) === '' && normChat(undefined) === '' && normChat('') === '');
// QA F28: harmless suffixes and fullwidth input read the same as the plain question
const f28 = [['ค่าเทอม ศาสนศึกษา???', 'ค่าเทอม ศาสนศึกษา'], ['ค่าเทอม เภสัชวิทยา 🙏', 'ค่าเทอม เภสัชวิทยา'], ['ศาสนศึกษา ครับ 🙏🏽', 'ศาสนศึกษา ครับ'],
  ['ปีการศึกษา ２๕๖๙', 'ปีการศึกษา 2๕๖๙'], ['ลงทะเบียน　ภาคต้น！', 'ลงทะเบียน ภาคต้น'], ['ทำไม?!~ ', 'ทำไม'], ['ป.โท ค่าเทอม 2569...', 'ป.โท ค่าเทอม 2569'], ['M.Sc. 2+2=4', 'M.Sc. 2+2=4']];
const badF = f28.filter(([i, o]) => normChat(i) !== o).map(([i, o]) => `${i} -> ${normChat(i)} (want ${o})`);
check('trailing ?!.~, emoji (with skin tones) and fullwidth ASCII are folded; inner punctuation stays (F28)', badF.length === 0, badF.join(' ; '));
check('a message that is only punctuation or emoji normalises to empty (the caller then keeps what was typed)', normChat('???') === '' && normChat('🙏') === '');

// --- study-ish but unresolvable -> finder (the caller does that when the KB also finds nothing) --------------------------------
const progPath = join(root, 'submissions/ui/programmes.json');
if (existsSync(progPath)) {
  const P = JSON.parse(readFileSync(progPath, 'utf8')).programmes;
  check('"เรียนราย" resolves to no programme (so the rescue path, not a wrong card, handles it)', resolveProgramme(normChat('เรียนรายยย'), P) === null);
  check('a real programme name survives elongation + typo ("จิตวิทยาคลีนิกกกกก")', (() => { const r = resolveProgramme(normChat('จิตวิทยาคลีนิกกกกก'), P); return r && (r.kind === 'one' ? r.row.code : r.rows[0].code) === '2022M04G'; })());
}

// --- "try these" chips ---------------------------------------------------------------------------------------------------
const kbPath = join(root, 'submissions/ui/knowledge-index.json');
if (!existsSync(kbPath)) check('knowledge-index.json present (python3 submissions/build_knowledge_index.py)', false);
else {
  const KB = JSON.parse(readFileSync(kbPath, 'utf8'));
  const sm = html.match(/function _jsGramSet[\s\S]*?\n}\nfunction search\(q\)\{/);
  const search = new Function('KB', sm[0].replace(/\nfunction search\(q\)\{$/, '\nreturn _jsSearch;'))(KB);
  const fm = html.match(/function starterEntries\(\)\{[\s\S]*?\n}\n/);
  check('starterEntries() found in chatbot.html', fm);
  const starters = new Function('KB', 'search', fm[0] + '\nreturn starterEntries;')(KB, search)();
  check('starter chips: 4 entries from 4 different categories', starters.length === 4 && new Set(starters.map(e => e.category)).size === 4, starters.map(e => e.category).join());
  check('every starter chip answers itself when tapped (its own title retrieves it first, with a confident score)', starters.every(e => { const r = search(e.title); return r[0] && r[0].e.id === e.id && r[0].s >= 4; }));
}

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
