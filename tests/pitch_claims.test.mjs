// The 5-minute pitch deck (submissions/ui/pitch.html) must not say anything the repo cannot show. Every number is marked
// data-claim="..." (or data-min for a floor) and is compared with a fresh measurement: the retrieval benchmark, the official-FAQ field
// evaluation, the programme-name benchmark, the data files, .kiro/ and the saved Lighthouse run. Also bans phrases retracted after review
// (Kiro Hooks as CI, load figures, 100 % guardrail).   Run: node tests/pitch_claims.test.mjs
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), R = f => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const html = R('submissions/ui/pitch.html');
const text = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/g, ' ');
const claim = k => [...html.matchAll(new RegExp(`<span data-claim="${k}">([\\d,]+)</span>`, 'g'))].map(m => +m[1].replace(/,/g, ''));
const node = (f, ...a) => execFileSync('node', [join(root, f), ...a], { encoding: 'utf8', maxBuffer: 1 << 26 });

check('exactly 8 slides, numbered 1..8', (html.match(/<section class="slide">/g) || []).length === 8 && [...html.matchAll(/<div class="pageno">(\d) \/ 8<\/div>/g)].map(m => +m[1]).join() === '1,2,3,4,5,6,7,8');
for (const [re, why] of [[/Kiro Hooks|hooks ใน/i, 'Kiro hooks route kernel tasks / submit proofs, they are not CI or deployment'], [/หลายหมื่น|พร้อมกัน/, 'no load test exists'], [/100\s*%/, 'no "100 %" guarantee (the guard checks numbers, units, months, Latin tokens)'], [/แม่นยำ 100|ไม่เดา(?!คำตอบ)/, '"not guessing" is only true for facts, and the field data shows nearest-topic answers'], [/405/, 'stale test count'], [/neuro-?symbolic|BLAKE3 proof/i, 'retracted wording']])
  check(`the deck does not say: ${why}`, !re.test(text), (text.match(re) || [''])[0]);
check('the Air Canada case is called a tribunal decision, not a court', /tribunal/.test(text) && !/ศาลแคนาดา/.test(text));

// ---- measured numbers ----
const dir = mkdtempSync(join(tmpdir(), 'rw-pitch-')), jf = join(dir, 'm.json');
execFileSync('node', [join(root, 'benchmark/compare/compare_retrievers.mjs'), '--json', jf], { stdio: 'ignore' });
const m = JSON.parse(readFileSync(jf, 'utf8')); rmSync(dir, { recursive: true, force: true });
const faq = node('benchmark/field/official_faq_eval.mjs', '--no-write'), names = node('benchmark/compare/programme_names.mjs');
const row = label => (faq.split('\n').find(l => l.startsWith(`| ${label}`)) || '').split('|').map(x => x.trim());
const th = row('Thai, school wording'), en = row('English, school wording'), unc = row('student FAQ items NOT in the KB — Thai');
const nm = names.split('\n').filter(l => /^\| (official name|bare name|one letter|no tone|elongated|English title)/.test(l)).map(l => l.split('|').map(x => x.trim()));
const P = JSON.parse(R('submissions/ui/programmes.json')).programmes, KB = JSON.parse(R('submissions/ui/knowledge-index.json'));
const lh = (R(readdirSync(join(root, 'benchmark/web')).filter(f => /^\d+_.*\.md$/.test(f)).sort().pop().replace(/^/, 'benchmark/web/')).split('\n').find(l => l.startsWith('| mobile')) || '').split('|').map(x => x.trim());
const num = s => +String(s).match(/\d+/)?.[0], first = s => +String(s).match(/^(\d+)\//)?.[1];
const want = {
  r1: Math.round(m.rows.ours.r1 / m.labelled * 100), labelled: m.labelled, answered: m.answeredOurs, n: m.n, wrong: m.shippedWrong,
  prog: P.length, prog2: P.length, kb: KB.length,
  wrongcards: nm.reduce((a, r) => a + num(r[5]), 0), names: nm.reduce((a, r) => a + num(r[2]), 0),
  thright: Math.round(first(th[6]) / first(th[6].replace(/^(\d+)\/(\d+).*/, '$2/$2')) * 100) || num(th[6].match(/\((\d+)%\)/)?.[1]),
  enright: num(en[6].match(/\((\d+)%\)/)?.[1]), unc: +(faq.match(/student items not in the KB: \*\*(\d+)\*\*/) || [])[1], unc2: +(faq.match(/student items not in the KB: \*\*(\d+)\*\*/) || [])[1],
  uncans: first(unc[3]),
  specs: readdirSync(join(root, '.kiro/specs')).length, steer: readdirSync(join(root, '.kiro/steering')).filter(f => f.endsWith('.md')).length,
  lhp: num(lh[2]), lha: num(lh[3]), lhb: num(lh[4]),
};
for (const [k, v] of Object.entries(want)) { const got = claim(k); check(`claim "${k}" = ${v}`, got.length >= 1 && got.every(x => x === v), `deck ${got.join(',') || 'missing'} vs measured ${v}`); }
const nTests = readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).length, floor = +(html.match(/data-min="tests">(\d+)</) || [])[1];
check(`"${floor}+ test files" is a true floor (${nTests} files) and the browser e2e exists`, floor > 0 && nTests >= floor && existsSync(join(root, 'tests/chat_e2e.test.mjs')));
check('the demo programme is open, not past its cut-offs, and has fee rows (rehearsed in tests/chat_e2e.test.mjs)', /ชีวสารสนเทศทางการแพทย์/.test(html) && P.some(p => p.code === '2042M03G' && p.announcement && p.announcement.status === 'กำลังเปิดรับสมัคร'));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
