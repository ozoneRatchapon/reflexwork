// Programme path in submissions/ui/chatbot.html: "I want to apply to <programme>" -> that programme's
// own page, instead of a generic how-to-apply answer.
// Run: node tests/programme_resolve.test.mjs   (exit 0 = pass, 1 = fail)
//
// Extracts the real resolveProgramme()/programmeCard() from the HTML (no copy) and runs them on
// submissions/ui/programmes.json (built from the public site by build_programme_catalogue.py).
// Four things are pinned: (1) catalogue integrity, (2) matching on realistic phrasings,
// (3) the 50 KB eval questions are NOT stolen by this path, (4) text from the web is escaped.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from "node:path";
import * as WASM from "../submissions/ui/wasm/reflex_wasm.js";
// the abbreviations the Rust resolver expands (crates/reflex-wasm/src/resolve/patterns.rs ALIASES); the page no longer has a copy
const ALIAS_KEYS = ["mph", "itm"];
WASM.initSync({ module: readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "submissions/ui/wasm/reflex_wasm_bg.wasm")) });

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const progPath = join(root, 'submissions/ui/programmes.json');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };

const bm = html.match(/\/\/ <programme-resolve>([\s\S]*?)\/\/ <\/programme-resolve>/);
const lk = html.match(/\/\/ <linkify>([\s\S]*?)\/\/ <\/linkify>/);   // the card links URLs in site text via linkify()
check('linkify block found in chatbot.html', lk);
if (lk && bm) bm[1] = lk[1] + '\n' + bm[1];
check('programme-resolve block found in chatbot.html', bm);
if (!bm) process.exit(1);
check('programmes.json present (build with submissions/build_programme_catalogue.py)', existsSync(progPath));
if (!existsSync(progPath)) process.exit(1);
const { resolveProgramme, programmeCard, _pFee, followUpAspect, isFinderQuestion, finderInit, finderFacets, finderHtml } = new Function("WASM", "ENG", html.match(/\/\/ <today>([\s\S]*?)\/\/ <\/today>/)[1] + bm[1] + '\nreturn {resolveProgramme, programmeCard, _pFee, followUpAspect, isFinderQuestion, finderInit, finderFacets, finderHtml};')(WASM, {});
const DOC = JSON.parse(readFileSync(progPath, 'utf8')), P = DOC.programmes;
const by = Object.fromEntries(P.map(p => [p.code, p]));

// --- (1) catalogue integrity -------------------------------------------------------------------------------
check('catalogue has ≥ 300 programmes', P.length >= 300, String(P.length));
check('codes are unique and well-formed', new Set(P.map(p => p.code)).size === P.length && P.every(p => /^\d{4}[MDNC]\d{2}[GS]$/.test(p.code)));
check('every row has title, level, faculty and an official detail_url', P.every(p => p.title && p.level && p.faculty && /^https:\/\/graduate\.mahidol\.ac\.th\//.test(p.detail_url)));
check('no markup leaked into titles', P.every(p => !/[<>]/.test(p.title)), P.filter(p => /[<>]/.test(p.title)).map(p => p.code).join());
const A = P.filter(p => p.announcement);
check('most programmes have a ' + DOC.year + ' announcement', A.length >= P.length * 0.5, `${A.length}/${P.length}`);
const STATUS = new Set(['กำลังเปิดรับสมัคร', 'ปิดรับสมัครแล้ว']);
check('announcement status is one of the two values the site shows', A.every(p => STATUS.has(p.announcement.status)), [...new Set(A.map(p => p.announcement.status))].join('|'));
check('announcement page belongs to the programme (id derived from the code)', A.every(p => p.announcement.url.includes('id=' + p.announce_id)));
// The schedule is not in FULL: two pages (2050DG00, 4301DG00) publish an empty schedule table - verified in the raw HTML.
const FULL = ['แผนการศึกษาที่เปิดรับสมัคร', 'คุณสมบัติของผู้มีสิทธิ์สมัคร'];
const full = p => FULL.every(h => (p.announcement.sections[h] || []).length);
check('every OPEN announcement has full details (plans + eligibility)', A.every(p => p.announcement.status !== 'กำลังเปิดรับสมัคร' || full(p)), A.filter(p => p.announcement.status === 'กำลังเปิดรับสมัคร' && !full(p)).map(p => p.code).slice(0, 6).join());
check('an announcement without details is a closed one (never an open page the parser failed on)', A.every(p => full(p) || p.announcement.status === 'ปิดรับสมัครแล้ว'), A.filter(p => !full(p) && p.announcement.status !== 'ปิดรับสมัครแล้ว').map(p => p.code).slice(0, 6).join());
check('a page that has some details has all of them (parser did not drop a section)', A.every(p => { const n = FULL.filter(h => (p.announcement.sections[h] || []).length).length; return n === 0 || n === FULL.length; }),
  A.filter(p => { const n = FULL.filter(h => (p.announcement.sections[h] || []).length).length; return n && n !== FULL.length; }).map(p => p.code).slice(0, 6).join());
// a section ends at the next heading: the schedule once swallowed the documents list and the apply-method block
check('no section swallows the next one (schedule holds no documents / apply-method lines)', A.every(p => !(p.announcement.sections['กำหนดการสอบคัดเลือก'] || []).some(l => /^(?:หลักฐานการสมัคร|วิธีการรับสมัคร|รูปถ่าย|สมัครผ่านระบบ)/.test(l))));
const FEE = 'ค่าธรรมเนียมการศึกษา', complete = A.filter(p => (p.announcement.sections['แผนการศึกษาที่เปิดรับสมัคร'] || []).length);
check('every complete announcement carries its fee section', complete.every(p => (p.announcement.sections[FEE] || []).length), complete.filter(p => !(p.announcement.sections[FEE] || []).length).map(p => p.code).slice(0, 6).join());
check('no e-mail address is republished (staff contacts stay on the official page)', !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(JSON.stringify(DOC)));
check('stamped with a fetch date', /^\d{4}-\d{2}-\d{2}$/.test(DOC.fetched_at));

// --- (2) realistic phrasings ---------------------------------------------------------------------------------
const run = q => resolveProgramme(q, P);
const codes = r => !r ? [] : r.kind === 'one' ? [r.row.code] : r.rows.map(x => x.code);
const expectOne = (q, code) => { const r = run(q); check(`ONE ${code}: ${q}`, r && r.kind === 'one' && r.row.code === code, r ? `${r.kind} ${codes(r).join()}` : 'no match'); };
const expectIn = (q, code) => { const r = run(q); check(`has ${code}: ${q}`, r && codes(r).includes(code), r ? `${r.kind} ${codes(r).join()}` : 'no match'); };
const expectNone = q => { const r = run(q); check(`no programme path: ${q}`, r === null, r ? `${r.kind} ${codes(r).join()}` : ''); };

expectOne('สมัคร 2022M04G', '2022M04G');
expectOne('อยากสมัครเรียนจิตวิทยาคลินิก', '2022M04G');
expectOne('สมัครเรียนวิศวกรรมชีวการแพทย์ ปริญญาเอก', '3802D03G');
expectOne('ป.เอก วิศวกรรมชีวการแพทย์', '3802D03G');
expectIn('ป.โท ฟิสิกส์การแพทย์ สมัครยังไง', '2029M03G');
expectIn('สนใจดนตรี ป.โท', '4201M03G');
expectIn('จะสมัครเรียนหลักสูตรสาธารณสุขศาสตรมหาบัณฑิต', '2326M03G');
expectIn('อยากสมัคร MPH', '2326M03G');
expectIn('อยากเรียนต่อโทด้านการพยาบาลเด็ก', '2216M03G');
expectIn('สมัครเรียนภาษาศาสตร์', '7301M04G');
expectIn('ภาษาศาสตร์', '7301M04G');                                   // a bare programme name is enough
expectIn('มีหลักสูตรเคมีไหม', '2129M03G');
expectIn('clinical psychology master', '2022M04G');                  // English via the announcement's English title
// level / kind filters really filter
{ const r = run('อยากสมัครเรียนภาษาศาสตร์ ปริญญาเอก'); check('level D keeps only the doctoral programme', r && codes(r).every(c => c[4] === 'D') && codes(r).includes('7301D04G'), r ? codes(r).join() : 'no match'); }
{ const r = run('ภาษาศาสตร์ ป.โท'); check('level M keeps only the master programme', r && codes(r).every(c => c[4] === 'M') && codes(r).includes('7301M04G'), r ? codes(r).join() : 'no match'); }
// a field word is not a programme: ask for more instead of listing 30
{ const r = run('สมัครเรียนวิทยาศาสตร์'); check('very broad word → broad (asks to narrow), not a list', r && r.kind === 'broad' && r.total > 12, r ? r.kind + ' ' + r.total : 'no match'); }
// filler inside a field name must survive (ต่อ/ที่/ศึกษา are not stripped from the middle or start of a name)
{ // names that begin / end with a word the intent stripper removes elsewhere must survive intact
  const coreOf = t => { t = t.replace(/\([^)]*\)/g, ' '); const k = t.indexOf('สาขาวิชา'); return (k >= 0 ? t.slice(k + 8) : t).replace(/\s+/g, ''); };
  const risky = P.filter(p => /^(?:ศึกษา|ต่อ|ที่|ใน|ของ|ด้าน|สาขา|หา|ดู|มี|การ|ทาง|เกี่ยวกับ|อยาก|สนใจ)/.test(coreOf(p.title)) || /(?:ศึกษา|หลักสูตร|ด้วย|บ้าง|ไหม|นะ|ทำ|สาย)$/.test(coreOf(p.title)));
  const lvl = c => ({ M: 'ปริญญาโท', D: 'ปริญญาเอก', C: 'ประกาศนียบัตร', N: 'ประกาศนียบัตรบัณฑิตชั้นสูง' })[c[4]];
  const broken = risky.filter(p => !codes(run(`สมัครเรียน${coreOf(p.title)} ${lvl(p.code)}`)).includes(p.code));
  check(`names that start/end with a strippable word survive (${risky.length} programmes)`, risky.length >= 20 && broken.length === 0, `${risky.length} risky; broken ${broken.map(p => p.code).slice(0, 6).join()}`);
}
// alias expansions must hit the catalogue (a stale alias is a silent dead end)
for (const a of ALIAS_KEYS) { const r = run('อยากสมัคร ' + a.toUpperCase()); check(`alias ${a.toUpperCase()} resolves to ≥1 programme`, r && codes(r).length >= 1, r ? '' : 'no match'); }
// not a programme question -> leave it to the KB
for (const q of ['สมัครเรียนได้ไหม', 'อยากเรียนโทที่มหิดล', 'ส่งเล่มวิทยานิพนธ์กี่วัน', 'ลงทะเบียนภาคปลายวันไหน', 'วันนี้อากาศเป็นยังไง', 'ทุนการศึกษามีอะไรบ้าง',
  'ค่าเทอม ป.โท เท่าไหร่', 'ค่าเทอมพยาบาล', 'ค่าสมัครจิตวิทยาคลินิก', 'ค่าธรรมเนียมการสมัครเท่าไหร่']) expectNone(q);   // no programme / too broad / application fee -> KB
// fee or scholarship as the TOPIC of a programme question -> that programme's own table, not the KB's general answer
{ const r = run('ค่าเทอมจิตวิทยาคลินิกเท่าไหร่'); check('fee question naming a programme → that programme, topic=fee', r && r.kind === 'one' && r.row.code === '2022M04G' && r.topic === 'fee', r ? `${r.kind} ${codes(r).join()} ${r.topic}` : 'no match'); }
{ const r = run('ค่าใช้จ่ายตลอดหลักสูตรวิศวกรรมชีวการแพทย์ ปริญญาเอก'); check('fee topic words do not leak into the name match', r && r.kind === 'one' && r.row.code === '3802D03G' && r.topic === 'fee', r ? `${r.kind} ${codes(r).join()}` : 'no match'); }
{ const r = run('ทุน tropical medicine'); check('scholarship question keeps its topic', r && codes(r).includes('4801M03G') && r.topic === 'scholarship', r ? `${r.kind} ${codes(r).join()} ${r.topic}` : 'no match'); }
{ const r = run('ค่าเทอม 2231D03G'); check('picker button (topic + code) keeps the topic', r && r.kind === 'one' && r.row.code === '2231D03G' && r.topic === 'fee'); }

// self-consistency: ask for every programme by its own name (+ level word when needed) and see where it lands
{
  const coreOf = t => { t = t.replace(/\([^)]*\)/g, ' '); const i = t.indexOf('สาขาวิชา'); return (i >= 0 ? t.slice(i + 8) : t.replace(/มหาบัณฑิต|ดุษฎีบัณฑิต|ประกาศนียบัตรบัณฑิตชั้นสูง|ประกาศนียบัตรบัณฑิต/g, '')).replace(/\s+/g, ''); };
  let found = 0, one = 0, miss = [];
  for (const p of P) {
    const lvl = { M: 'ปริญญาโท', D: 'ปริญญาเอก', C: 'ประกาศนียบัตร', N: 'ประกาศนียบัตรบัณฑิตชั้นสูง' }[p.code[4]];
    const r = run(`อยากสมัครเรียน${coreOf(p.title)} ${lvl}`);
    if (r && codes(r).includes(p.code)) { found++; if (r.kind === 'one') one++; } else miss.push(p.code);
  }
  const n = P.length;
  console.log(`  by-own-name: reachable ${found}/${n} (${Math.round(found / n * 100)}%) · landed on exactly that programme ${one}/${n} (${Math.round(one / n * 100)}%)`);
  check('≥ 95% of programmes are reachable by their own name + level', found >= n * 0.95, `${found}/${n}; missed ${miss.slice(0, 8).join()}`);
}

// --- vocabulary: how people actually say it vs the official name -------------------------------------------------
// [phrasing, any-of expected codes, gap]. gap=true = a KNOWN miss (documented, counted, not failing): the
// colloquial word shares too few characters with the official name, so only a synonym entry can fix it.
// When a synonym is added, flip gap to false; a non-gap case that regresses fails the test.
{
  const PH = [
    ['อยากเรียนทันตแพทย์', ['3319M04G'], false],
    ['สมัครจัดฟัน', ['3312N02G'], false],
    ['เภสัชวิทยา ป.โท', ['2108M04G'], false],
    ['ออร์โธปิดิกส์', ['2051D02G'], false],
    ['สมัครอาชีวอนามัย', ['2307M05G'], false],
    ['เรียนทำกายอุปกรณ์', ['2044M03G'], false],
    ['สมัครประชากรศึกษา', ['2503D04G'], false],
    ['อยากเรียนการจัดการเทคโนโลยีสารสนเทศ ภาคพิเศษ', ['3801M05S'], false],
    ['ITM สมัคร', ['3801M05S'], false],
    ['forensic science สมัคร', ['2125M03G'], false],
    ['polymer science phd', ['2110D03G'], false],
    ['tropical medicine', ['4801M03G'], false],
    ['สมัครเรียนพยาบาลชุมชน', ['2812M03S', '2218M05S', '2812M04G'], false], // middle words dropped (official: การพยาบาลเวชปฏิบัติชุมชน) - piece coverage
    ['เรียนโภชนาการ', ['5201M03G'], true],          // โภชนาการ vs official โภชนศาสตร์
    ['นิติวิทย์', ['2125M03G'], false],              // short form of นิติวิทยาศาสตร์ (prefix is enough)
    ['สมัครเรียนบำบัดยาเสพติด', ['7002M01S'], true], // official: วิทยาการเสพติด
    ['ศัลยศาสตร์ผิวหนัง', ['2050D02G'], true],        // official: ตจศัลยศาสตร์
  ];
  let ok = 0, gaps = 0, gapsClosed = [], regress = [];
  for (const [q, want, gap] of PH) {
    const got = codes(run(q)), hit = want.some(c => got.includes(c));
    if (gap) { gaps++; if (hit) gapsClosed.push(q); } else if (hit) ok++; else regress.push(`${q} -> ${got.join() || 'none'}`);
  }
  const solid = PH.filter(x => !x[2]).length;
  console.log(`  phrasings: ${ok}/${solid} resolved · ${gaps} known vocabulary gaps${gapsClosed.length ? ` (now closed, flip gap→false: ${gapsClosed.join(' | ')})` : ''}`);
  check('every non-gap phrasing resolves to the right programme', regress.length === 0, regress.join(' ; '));
}

// --- follow-up turns: after a programme card, a short aspect question refers to THAT programme ---------------------
{
  const want = [['แล้วค่าเทอมล่ะ', 'fee'], ['ค่าเทอมเท่าไหร่', 'fee'], ['มีทุนไหม', 'scholarship'], ['ใช้เอกสารอะไรบ้าง', 'docs'], ['ต้องจบอะไรมา', 'elig'],
    ['คุณสมบัติผู้สมัครมีอะไรบ้าง', 'elig'], ['ภาษาอังกฤษต้องได้เท่าไหร่', 'english'], ['สอบวันไหน', 'schedule'], ['สัมภาษณ์เมื่อไหร่', 'schedule'], ['ยังเปิดรับอยู่ไหม', 'status'], ['รับกี่คน', 'status']];
  const bad = want.filter(([q, a]) => followUpAspect(q) !== a).map(([q, a]) => `${q} -> ${followUpAspect(q) || 'none'} (want ${a})`);
  check(`follow-up aspect read correctly (${want.length} phrasings)`, bad.length === 0, bad.join(' ; '));
  // a question that brings its own scope is NOT a follow-up: level, code, other topic, university-wide, long, or no aspect at all
  const not = ['ค่าเทอม ป.โท เท่าไหร่', 'ค่าเทอม 2022M04G', 'ค่าสมัครเท่าไหร่', 'ค่าเทอมทุกหลักสูตรเท่าไหร่', 'ทุนของมหิดลมีอะไรบ้าง', 'ลงทะเบียนภาคปลายวันไหน', 'ส่งเล่มวิทยานิพนธ์กี่วัน',
    'ขอบคุณครับ', 'โอเค', 'อยากถามเรื่องการลาพักการศึกษาระหว่างภาคเรียนว่าต้องยื่นเอกสารที่ไหนและใช้เวลากี่วัน'];
  const wrong = not.filter(q => followUpAspect(q));
  check('questions with their own scope are not read as follow-ups', wrong.length === 0, wrong.map(q => `${q} -> ${followUpAspect(q)}`).join(' ; '));
  // every aspect renders for every announced programme (the follow-up card can never throw or come out empty)
  const aspects = ['fee', 'scholarship', 'docs', 'elig', 'english', 'schedule', 'status'];
  check('every aspect renders a card for every programme', P.every(p => aspects.every(a => { try { return programmeCard(p, DOC.fetched_at, DOC.year, a).html.length > 40; } catch (e) { return false; } })));
  { const h = programmeCard(by['2231D03G'], DOC.fetched_at, DOC.year, 'docs').html; check('docs follow-up leads with the documents list, unfolded', /^[\s\S]*?📎 หลักฐานการสมัคร \(ตามประกาศ\)\n/.test(h) && !/<summary>📎/.test(h), h.slice(0, 160)); }
}

// --- finder ("เรียนไรดี"): narrow the catalogue by official facets, never pick a "best" programme ---------------------
{
  const yes = ['เรียนไรดี', 'เรียนอะไรดี', 'อยากเรียนต่อโท เรียนอะไรดี', 'ป.โท สาขาไหนดี', 'มีหลักสูตรอะไรบ้าง', 'ไม่รู้จะเรียนอะไร', 'แนะนำหลักสูตรหน่อย', 'หลักสูตรที่เปิดรับมีอะไรบ้าง', 'what should i study'];
  const no = ['มีสาขาเคมีไหม', 'จิตวิทยาคลินิกดีไหม', 'ลงทะเบียนวิชาอะไรดี', 'สมัครเรียนจิตวิทยาคลินิก', 'ค่าเทอมเท่าไหร่', 'ส่งเล่มวิทยานิพนธ์กี่วัน'];
  check('finder triggers on "what should I study" questions only', yes.every(isFinderQuestion) && !no.some(isFinderQuestion), [...yes.filter(q => !isFinderQuestion(q)), ...no.filter(isFinderQuestion)].join(' | '));
  const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
  check('finder takes none of the KB titles', !KB.some(e => isFinderQuestion(e.title)), KB.filter(e => isFinderQuestion(e.title)).map(e => e.id).join());
  const isOpen = p => p.announcement && p.announcement.status === 'กำลังเปิดรับสมัคร';
  const f0 = finderInit('เรียนไรดี'), F0 = finderFacets(P, f0);
  check('finder start: all programmes, levels sum to the catalogue', F0.total === P.length && F0.levels.reduce((a, l) => a + l.n, 0) === P.length && F0.open === P.filter(isOpen).length);
  const fM = finderInit('ป.โท สาขาไหนดี'), FM = finderFacets(P, fM);
  check('level read from the question and counts match the data', fM.level === 'M' && FM.total === P.filter(p => p.code[4] === 'M').length && FM.faculties.reduce((a, x) => a + x.n, 0) === FM.total);
  const fx = { ...fM, open: true, intl: true }, Fx = finderFacets(P, fx);
  check('filters combine (master + open + international)', Fx.total === P.filter(p => p.code[4] === 'M' && isOpen(p) && p.kind === 'international').length);
  const fac = FM.faculties.find(x => x.n <= 12 && x.n >= 2), Ff = finderFacets(P, { ...fM, faculty: fac.name });
  check('narrowed to ≤ 12 -> the programmes themselves are listed', Ff.rows.length === fac.n && Ff.rows.every(p => p.faculty === fac.name && p.code[4] === 'M'));
  const big = FM.faculties[0], Fb = finderFacets(P, { ...fM, faculty: big.name });
  check(`a chosen faculty with > 12 programmes still lists them (${big.n}), no loop back to the faculty step`, big.n > 12 && Fb.rows.length === big.n);
  const h = finderHtml(finderFacets([{ ...P[0], faculty: '"><img src=x onerror=alert(1)>', title: '<script>alert(2)</script>' }], { level: '', faculty: '', open: false, intl: false, special: false }), { level: '', faculty: '"><img src=x onerror=alert(1)>', open: false, intl: false, special: false }, '2026-11-02', false);
  check('finder escapes catalogue text (also inside data attributes)', !/<img|<script/i.test(h), h.slice(0, 160));
  check('finder never claims a "best" programme', !/ดีที่สุด(?!\")/.test(finderHtml(F0, f0, DOC.fetched_at, false).replace(/ไม่ได้ตัดสินว่าสาขาไหน "ดี" ที่สุด/, '')));
}

// --- typing slips: tone marks, one dropped letter, near-miss picker ---------------------------------------------------------------------
{
  const coreOf = t => { t = t.replace(/\([^)]*\)/g, ' '); const i = t.indexOf('สาขาวิชา'); return (i >= 0 ? t.slice(i + 8) : t).replace(/\s+/g, ''); };
  const loose = q => resolveProgramme(q, P, true);
  expectIn('อยากสมัคร ทันตแพทย', '3319M04G');                                            // no karan: "ทันตแพทย์" typed as "ทันตแพทย"
  { const r = run('ชีวเมีและชีววิทยาโมเลกุลทางการแพทย์'); check('a short name hidden inside a mistyped LONG name never becomes the single card ("ชีววิทยา")', !(r && r.kind === 'one' && coreOf(r.row.title) === 'ชีววิทยา'), r ? `${r.kind} ${codes(r).join()}` : ''); }
  { const r = loose('ชีวเมีและชีววิทยาโมเลกุลทางการแพทย์'); check('near-miss picker finds the long name despite the slip', r && r.kind === 'many' && r.near && r.rows.some(x => /ชีวเคมีและชีววิทยาโมเลกุล/.test(x.title)), r ? codes(r).join() : 'null'); }
  { const r = loose('กายอุปกณ์'); check('near-miss: "กายอุปกณ์" -> the กายอุปกรณ์ programmes, as a picker', r && r.kind === 'many' && r.rows.some(x => x.code === '2044M03G'), r ? codes(r).join() : 'null'); }
  // property: the near-miss mode can never assert one programme, for any slip in any official name
  let single = 0, tried = 0;
  for (const p of P) { const c = [...coreOf(p.title)]; if (c.length < 7) continue; for (const cut of [3, Math.floor(c.length / 2)]) { const q = c.filter((_, i) => i !== cut).join(''); const r = loose(q); tried++; if (r && r.kind !== 'many') single++; } }
  check(`near-miss mode never returns a single card (${tried} slipped names)`, single === 0, String(single));
  for (const q of ['วันนี้อากาศเป็นยังไง', 'ร้านกาแฟใกล้ที่นี่อยู่ไหน', 'ลืมรหัสผ่านเข้าระบบ', 'ขอบคุณมากครับ']) check(`near-miss stays silent on unrelated text: ${q}`, loose(q) === null, (loose(q) || {}).kind);
}

// --- (3) the KB questions must not be stolen by the programme path --------------------------------------------
{
  const kbTest = readFileSync(join(root, 'tests/kb_search.test.mjs'), 'utf8');
  const qs = [...kbTest.matchAll(/^\s*\['([^']+)',\s*(?:'[^']*'|null),\s*'[^']*'\]/gm)].map(m => m[1]);
  const stolen = qs.filter(q => run(q) !== null);
  check(`none of the ${qs.length} KB eval questions is taken by the programme path`, qs.length >= 40 && stolen.length === 0, stolen.join(' | '));
  const KB = JSON.parse(readFileSync(join(root, 'submissions/ui/knowledge-index.json'), 'utf8'));
  const titleStolen = KB.filter(e => run(e.title) !== null);
  check(`none of the ${KB.length} KB entry titles is taken by the programme path`, KB.length >= 100 && titleStolen.length === 0, titleStolen.map(e => `${e.id}: ${e.title}`).slice(0, 6).join(' | '));
  // questions that only MENTION a programme (student life, other fees) belong to the KB / staff
  for (const q of ['เปลี่ยนอาจารย์ที่ปรึกษา จิตวิทยาคลินิก', 'สอบโครงร่างจิตวิทยาคลินิกต้องเตรียมอะไร', 'นักศึกษาจิตวิทยาคลินิกขอผ่อนผันทหาร', 'ค่าปรับ จิตวิทยาคลินิก', 'สอบประมวลความรู้ภาษาศาสตร์',
    'ขอใบรับรองนักศึกษา วิศวกรรมชีวการแพทย์', 'สนใจเข้าศึกษาต้องสมัครอย่างไร', 'ทุนต้องสมัครยังไง', 'ทุนสำหรับ', 'ค่าเทอมการศึกษา', 'ทุนเพื่อการ',
    'ค่าใช้จ่ายในการสมัครจิตวิทยาคลินิก', 'ค่าธรรมเนียมในการสมัคร จิตวิทยาคลินิก', 'ค่าธรรมเนียมรักษาสถานภาพ จิตวิทยาคลินิก', 'ค่าธรรมเนียมสอบภาษาอังกฤษ จิตวิทยาคลินิก']) expectNone(q);
  // no blocked word in these: only the bare-name rule (no intent word -> question must be ~only the name) stops them
  for (const q of ['หอพักนักศึกษา จิตวิทยาคลินิก', 'จิตวิทยาคลินิกจบไปทำงานอะไรได้บ้าง', 'อาจารย์ภาษาศาสตร์ใจดีไหม', 'รุ่นพี่วิศวกรรมชีวการแพทย์แนะนำอะไร']) expectNone(q);
  // ...while real programme questions phrased that way still resolve
  for (const [q, c] of [['มีสาขาเคมีไหม', '2129M03G'], ['จิตวิทยาคลินิกมีทุนไหม', '2022M04G'], ['ทุน เคมี มีไหม', '2129M03G'], ['เคมี ป.เอก', '2129D03G'],
    ['เคมี ป.โท', '2129M03G'], ['ฟิสิกส์ ป.เอก', '2118D03G'], ['ค่าเทอมเคมีต่อเทอม', '2129M03G'], ['ค่าเทอมเคมีภาคละเท่าไหร่', '2129M03G'], ['ค่าเทอมเคมีตลอดหลักสูตร', '2129M03G']]) expectIn(q, c);   // short name + level / fee qualifiers
  // the level typed without the dot ('ป เอก' / 'ปเอก' / a bare 'เอก'), found 2026-11-07: 'วิศวะคอม ป เอก' was 'not understood' and
  // 'วิศวกรรมคอมพิวเตอร์ ป เอก' opened the Master's card. As a word of its own only: 'วิชาเอก', 'โทร', 'ไปเอกสาร' are not levels.
  for (const [q, c] of [['เคมี ป เอก', '2129D03G'], ['เคมี ปเอก', '2129D03G'], ['เคมี เอก', '2129D03G'], ['เคมี ป เอกครับ', '2129D03G'], ['เคมี ป โท', '2129M03G'], ['ฟิสิกส์ ป เอก', '2118D03G']]) {
    const r = run(q); check(`level without the dot: ${q} -> ${c} only`, r && codes(r).includes(c) && codes(r).every(x => x[4] === c[4]), r ? `${r.kind} ${codes(r).join()}` : 'no match'); }
  expectOne('ป เอก วิศวกรรมชีวการแพทย์', '3802D03G');
  for (const q of ['วิชาเอกเลือกได้ไหม', 'เบอร์โทรบัณฑิตวิทยาลัย', 'ส่งไปเอกสารยังไง']) expectNone(q);
}

// --- (4) text from the web is untrusted: it must be escaped, links limited to the official site ------------------------
{
  const evil = { code: '9999M99G', title: '<img src=x onerror=alert(1)>', level: '<b>', faculty: '"><script>alert(2)</script>', kind: 'thai',
    detail_url: 'javascript:alert(3)', title_en: '<svg/onload=alert(4)>',
    announcement: { year: '2570', status: '<i>x</i>', intake: '<u>1</u>', url: 'https://evil.example/x', apply_url: 'javascript:alert(5)', title_en: '<svg/onload=alert(4)>', notice: ['<img src=x onerror=alert(11)>'],
      sections: { 'แผนการศึกษาที่เปิดรับสมัคร': ['<script>alert(6)</script>'], 'คุณสมบัติของผู้มีสิทธิ์สมัคร': ['<img src=x onerror=alert(7)>'], 'กำหนดการสอบคัดเลือก': ['<b>a</b> | <b>b</b>'], 'หลักฐานการสมัคร': ['<img src=x onerror=alert(12)>'], 'เงื่อนไขการยื่นผลคะแนนภาษาอังกฤษสำหรับผู้สมัครหลักสูตรนี้': ['<svg/onload=alert(13)>'],
        'ค่าธรรมเนียมการศึกษา': ['แผนการศึกษา | ระยะเวลา | x | y', 'ค่าวิจัย | ค่าธรรมเนียมการศึกษาดูงาน', 'แผน <b>z</b> | 1 ปี | 1 | 0 | 0', '[1] <script>alert(14)</script>'] } } };
  const evilOpen = { ...evil, announcement: { ...evil.announcement, status: 'กำลังเปิดรับสมัคร' } };
  const c = programmeCard(evil, '2026-11-02', '2570'), all = c.html + c.links;
  // the card itself only emits <b>/<small>/<br>/<details>/<summary>/<a>; every fixture payload is unique, so find any of them raw
  const allCards = [c, programmeCard(evilOpen, '2026-11-02', '2570'), programmeCard(evilOpen, '2026-11-02', '2570', 'fee')].map(x => x.html + x.links).join('');
  check('markup from the page is escaped in the card (notice, docs, English line, fee rows + notes included)', !/<(?:img|script|svg|i|u)[\s>/]|<b>[ab]<\/b>|<b>z<\/b>/i.test(allCards) && /&lt;img src=x onerror=alert\(1[12]\)/.test(allCards), allCards.slice(0, 200));
  check('apply button never uses a non-official URL even when the programme is open', !/javascript:/i.test(programmeCard(evilOpen, '2026-11-02', '2570').links));
  check('links never point off the official site or use javascript:', !/javascript:|evil\.example/i.test(all) && !/href=""/.test(all), all.slice(0, 200));
  // The apply button must exist only for a programme the site shows as open. (A bad variable here once resolved to
  // the browser's window.open - always truthy - so closed programmes silently got an apply button.)
  const OPEN = 'กำลังเปิดรับสมัคร';
  const btnWrong = A.filter(p => /🖊️/.test(programmeCard(p, DOC.fetched_at, DOC.year).links) !== (p.announcement.status === OPEN && !!p.announcement.apply_url));
  check('apply button appears only on open programmes (all ' + A.length + ' checked)', btnWrong.length === 0, btnWrong.map(p => p.code).slice(0, 6).join());
  // fee table: every data row on the page is read (none silently dropped); an empty table is said to be empty
  const feeL = p => p.announcement.sections[FEE] || [], dataRows = L => L.filter(l => l.includes('|') && !/^แผนการศึกษา \| ระยะเวลา|^ค่าวิจัย/.test(l)).length;
  const feeLost = A.filter(p => dataRows(feeL(p)) !== _pFee(feeL(p)).rows.length);
  const feeN = A.filter(p => _pFee(feeL(p)).rows.length).length;
  console.log(`  fee tables read: ${feeN}/${A.filter(p => feeL(p).length).length} announcements with a fee section`);
  check('fee rows are never silently dropped', feeLost.length === 0, feeLost.map(p => p.code).slice(0, 6).join());
  { const h = programmeCard(by['2231D03G'], DOC.fetched_at, DOC.year, 'fee').html; check('fee card shows the page\'s own amounts (Thai and international)', /50,000/.test(h) && /55,000/.test(h) && /นักศึกษาต่างชาติ/.test(h), h.slice(0, 200)); }
  { const h = programmeCard(by['2022M04G'], DOC.fetched_at, DOC.year, 'fee').html; check('an empty fee table says so and shows no amount', /ยังไม่ระบุอัตรา/.test(h) && !/บาท\/ภาค/.test(h)); }
  { const ev = { ...evil, announcement: { ...evil.announcement, sections: { [FEE]: ['แผนการศึกษา | ระยะเวลาศึกษา | x | y', 'ค่าวิจัย | ค่าธรรมเนียมการศึกษาดูงาน', 'นักศึกษาไทย', '<img src=x onerror=alert(8)> | <b>1</b> | 1,000 | 0 | <script>alert(9)</script>'], 'ทุนการศึกษาของหลักสูตร': ['<svg/onload=alert(10)>'] } } };
    const fh = programmeCard(ev, '2026-11-02', '2570', 'fee').html + programmeCard(ev, '2026-11-02', '2570', 'scholarship').html;
    check('fee and scholarship text from the page is escaped', /1,000/.test(fh) && !/<(img|script|svg)[\s>/]/i.test(fh), fh.slice(0, 200)); }
  check('every announced programme renders a card without throwing', A.every(p => { try { return programmeCard(p, DOC.fetched_at, DOC.year).html.length > 40; } catch (e) { return false; } }));
  check('a programme without an announcement says so and does not claim it is closed', /ยังไม่พบประกาศ/.test(programmeCard({ ...by[P[0].code], announcement: null }, '2026-11-02', '2570').html) && !/ปิดรับสมัครแล้ว/.test(programmeCard({ ...by[P[0].code], announcement: null }, '2026-11-02', '2570').html));
}

// --- QA round 1: pasted official titles (F24), short names before an ask word (F25), slips around a shorter name (F27) ----------
{ const one = (q, code, topic = '') => { const r = resolveProgramme(q, P); return r && r.kind === 'one' && r.row.code === code && (r.topic || '') === topic; };
  const pick = (q, codes) => { const r = resolveProgramme(q, P); return r && r.kind === 'many' && codes.every(c => r.rows.some(x => x.code === c)); };
  const intl = P.filter(p => /\(หลักสูตรนานาชาติ\)$/.test(p.title) && P.filter(x => x.title === p.title).length === 1);
  const lost = intl.filter(p => { const r = resolveProgramme(p.title, P); return !r || !(r.kind === 'one' ? r.row.code === p.code : r.rows.some(x => x.code === p.code)); });
  check(`every unique international title pasted whole finds its programme (${intl.length} titles, F24)`, lost.length === 0, lost.slice(0, 4).map(p => p.title).join(' ; '));
  check('a Thai official title resolves to its own programme, not a 64-way broad match (F24)', one('วิทยาศาสตรมหาบัณฑิต สาขาวิชาตจวิทยา', '2229M03G') && one('ประกาศนียบัตรบัณฑิตทางวิทยาศาสตร์การแพทย์คลินิก สาขาวิชาทันตแพทยศาสตร์', '3319C03G'));
  check('a topic phrase before the full title still answers for it (F24)', one('สอบสัมภาษณ์วันไหน วิทยาศาสตรมหาบัณฑิต สาขาวิชาจิตวิทยาคลินิก', '2022M04G', 'schedule'));
  check('a name ending in มี keeps it before an ask word: เคมี/ชีวเคมี + schedule/status (F25)',
    ['เคมีสอบข้อเขียนวันไหน', 'เคมีรายงานตัวเมื่อไหร่', 'เคมีประกาศผลวันไหน', 'เคมีสอบสัมภาษณ์วันไหน', 'เคมียังเปิดรับอยู่ไหม'].every(q => pick(q, ['2129D03G', '2129M03G'])) && pick('ชีวเคมียังเปิดรับอยู่ไหม', ['2105D03G', '2105M03G']));
  check('a มี that belongs to the ask is still removed ("จิตวิทยาคลินิกมีทุนไหม")', one('จิตวิทยาคลินิกมีทุนไหม', '2022M04G', 'scholarship') && one('จิตวิทยาคลินิกมีสอบสัมภาษณ์ไหม', '2022M04G', 'schedule'));
  const slips = [['สมัครเรียน จุลชีววิทยาสาธารณุข', '2121D03G'], ['สมัครเรียน ชีวเวชศาสตร์ทางัตวแพทย์', '2045D03G'], ['สมัครเรียน วิทยาการระบาดทากงารแพทย์', '2025M01S'], ['สมัครเรียน วิทยาการระบาดดคลินิก', '2025M01S']];
  check('a one-letter slip around a shorter name never gives that shorter programme as a single card (F27)', slips.every(([q, wrong]) => { const r = resolveProgramme(q, P); return !(r && r.kind === 'one' && r.row.code === wrong); }), slips.map(([q]) => { const r = resolveProgramme(q, P); return r && r.kind; }).join());
  check('...and the slip "จุลชีววิทยาสาธารณุข" offers the programme meant', pick('สมัครเรียน จุลชีววิทยาสาธารณุข', ['2325D05G']));
  check('a name with only filler around it keeps its strong match ("เรียนทำกายอุปกรณ์")', (r => r && r.kind !== 'broad' && r.rows ? r.rows.some(x => /กายอุปกรณ์/.test(x.title)) : r && /กายอุปกรณ์/.test(r.row.title))(resolveProgramme('เรียนทำกายอุปกรณ์', P)));
}

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
