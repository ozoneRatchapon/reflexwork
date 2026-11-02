// Synthetic robustness benchmark for the programme resolver (submissions/ui/chatbot.html <programme-resolve>) vs a plain baseline.
//   node benchmark/compare/programme_names.mjs [--json out.json]
// Ground truth is BY CONSTRUCTION: every query is derived from a programme's own official name by a seeded perturbation, so the
// right programme is known. It measures robustness to how people type (slips, missing tone marks, elongation, English), NOT whether
// people ask for programmes this way - for that, see the gap log. Baseline = character-trigram TF-IDF cosine over the same names,
// given the SAME input cleaning as the resolver (normChat + tone-mark stripping), so the comparison isolates the matching logic.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'submissions/ui/chatbot.html'), 'utf8');
const blk = n => html.match(new RegExp(`// <${n}>([\\s\\S]*?)// </${n}>`))[1];
const { resolveProgramme, normChat } = new Function(blk('chat-normalize') + blk('linkify') + blk('programme-resolve') + '\nreturn {resolveProgramme, normChat};')();
const P = JSON.parse(readFileSync(join(root, 'submissions/ui/programmes.json'), 'utf8')).programmes;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261102);
const coreOf = t => { t = t.replace(/\([^)]*\)/g, ' '); const i = t.indexOf('สาขาวิชา'); return (i >= 0 ? t.slice(i + 8) : t.replace(/มหาบัณฑิต|ดุษฎีบัณฑิต|ประกาศนียบัตรบัณฑิตชั้นสูง|ประกาศนียบัตรบัณฑิต/g, '')).replace(/\s+/g, ''); };
const LV = { M: 'ปริญญาโท', D: 'ปริญญาเอก', C: 'ประกาศนียบัตร', N: 'ประกาศนียบัตรบัณฑิตชั้นสูง' };
const toneless = s => s.replace(/[่-์]/g, '');
const THAI = /[ก-ฮ]/;
const SETS = {
  'official name + level':     p => `อยากสมัครเรียน${coreOf(p.title)} ${LV[p.code[4]]}`,
  'bare name':                 p => coreOf(p.title),
  'one letter dropped':        p => { const c = [...coreOf(p.title)], ix = c.map((ch, i) => i).filter(i => i > 1 && i < c.length - 1 && THAI.test(c[i])); if (c.length < 7 || !ix.length) return null; c.splice(ix[Math.floor(rng() * ix.length)], 1); return c.join(''); },
  'no tone marks':             p => { const c = coreOf(p.title), t = toneless(c); return t === c ? null : t; },
  'elongated ending':          p => { const c = [...coreOf(p.title)]; return c.join('') + c[c.length - 1].repeat(3); },
  'English title':             p => { const e = (p.announcement && p.announcement.title_en) || p.title_en; return e ? e.toLowerCase() : null; },
};

// baseline: char-trigram TF-IDF over the same names, identical input cleaning
const clean = s => toneless(normChat(s)).toLowerCase().replace(/\s+/g, '');
const names = P.map(p => ({ p, forms: [clean(coreOf(p.title)), clean(p.title.replace(/\([^)]*\)/g, '')), clean((p.announcement && p.announcement.title_en) || p.title_en || '')].filter(Boolean) }));
const gramsOf = s => { const g = new Set(); for (let i = 0; i < s.length - 2; i++) g.add(s.slice(i, i + 3)); return g; };
const df = new Map(); for (const n of names) for (const f of n.forms) for (const g of gramsOf(f)) df.set(g, (df.get(g) || 0) + 1);
const idf = g => Math.log((P.length * 3 + 1) / ((df.get(g) || 0) + 1)) + 1;
const vec = s => { const v = new Map(); let n2 = 0; for (const g of gramsOf(s)) { const w = idf(g); v.set(g, w); n2 += w * w; } const nr = Math.sqrt(n2) || 1; for (const [k, w] of v) v.set(k, w / nr); return v; };
const NV = names.map(n => n.forms.map(vec));
function baseline(q) { const qv = vec(clean(q)); const sc = names.map((n, i) => ({ p: n.p, s: Math.max(...NV[i].map(dv => { let c = 0; for (const [g, w] of qv) { const x = dv.get(g); if (x) c += w * x; } return c; })) })); sc.sort((a, b) => b.s - a.s || (a.p.code < b.p.code ? -1 : 1)); return sc; }
const TH = 0.6;   // fixed, untuned: answer with a single programme only if cosine >= 0.6

const res = {};
for (const [set, mk] of Object.entries(SETS)) {
  const qs = P.map(p => ({ p, q: mk(p) })).filter(x => x.q);
  const mkR = () => ({ hit: 0, name: 0, wrong: 0, none: 0, shown: 0 });
  const R = { n: qs.length, ours: mkR(), base: mkR(), miss: [] };
  for (const { p, q } of qs) {
    const same = r => coreOf(r.title) === coreOf(p.title);
    // ours = the chat's pipeline for this kind of text: strict resolver, then (nothing found) the near-miss picker
    let r = resolveProgramme(normChat(q), P);
    if (!r) r = resolveProgramme(normChat(q), P, true);
    const show = !r || r.kind === 'broad' ? [] : r.kind === 'one' ? [r.row] : r.rows;
    if (!show.length) { R.ours.none++; if (R.miss.length < 6) R.miss.push(q); }
    R.ours.shown += show.length; R.ours.hit += show.some(x => x.code === p.code) ? 1 : 0; R.ours.name += show.some(same) ? 1 : 0;
    if (show.length === 1 && !same(show[0])) R.ours.wrong++;
    const b = baseline(q);
    const bs = b[0].s >= TH ? [b[0].p] : b.slice(0, 6).map(x => x.p);
    R.base.shown += bs.length; R.base.hit += bs.some(x => x.code === p.code) ? 1 : 0; R.base.name += bs.some(same) ? 1 : 0;
    if (bs.length === 1 && !same(bs[0])) R.base.wrong++;
  }
  res[set] = R;
}
const pct = (k, n) => (100 * k / n).toFixed(0) + '%';
const out = [`## Programme names - ${P.length} programmes, seeded perturbations (seed 20261102), ${Object.keys(SETS).length} sets\n`,
  'right name = something with the intended programme\'s NAME is shown (any level / plan / faculty, which is all a level-less query can ask for). exact = the intended programme code itself is among what is shown. wrong card = ONE programme with a DIFFERENT name is shown as the answer (the harmful error). no card = nothing shown (falls to the KB / staff). shown = mean programmes put in front of the user. ours = strict resolver, then the near-miss picker. Baseline = char-trigram TF-IDF, same input cleaning: one card if cosine >= 0.6 (fixed, untuned), else a picker of its top 6 - it never abstains.\n',
  '| query set | n | ours: right name | ours: exact | ours: wrong card | ours: no card | ours: shown | base: right name | base: exact | base: wrong card | base: shown |', '|---|---|---|---|---|---|---|---|---|---|---|'];
for (const [set, R] of Object.entries(res)) out.push(`| ${set} | ${R.n} | ${pct(R.ours.name, R.n)} | ${pct(R.ours.hit, R.n)} | ${R.ours.wrong} | ${R.ours.none} (${pct(R.ours.none, R.n)}) | ${(R.ours.shown / R.n).toFixed(1)} | ${pct(R.base.name, R.n)} | ${pct(R.base.hit, R.n)} | ${R.base.wrong} | ${(R.base.shown / R.n).toFixed(1)} |`);
console.log(out.join('\n'));
const ji = process.argv.indexOf('--json'); if (ji > 0) (await import('node:fs')).writeFileSync(process.argv[ji + 1], JSON.stringify(res, null, 1));
