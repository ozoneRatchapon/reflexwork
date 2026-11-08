// Judge-view counters count each typed question once, by what the student got (QA G30/G31); a late understand reply never lands
// under a newer question (QA F60); a failed rewrite is retried, not cached (QA F31).   Run: node tests/counters_turns.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'submissions/ui/chatbot.html'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : `  ← ${detail}`)); ok ? pass++ : fail++; };
const core = html.slice(html.indexOf('function _askCore(){'), html.indexOf('function paintBar(){'));
const advice = core.slice(core.indexOf("if(take(['advice_abstain','advice_strong','advice_hybrid'])){"), core.indexOf("const mid='hyb'"));

// F31: behaviour - run rewriteQuery() against a scripted fetch
const rwSrc = html.slice(html.indexOf('const _RW_CACHE = new Map();'), html.indexOf('function understand('));
const replies = [];
const fakeFetch = async () => { const r = replies.shift(); return { ok: r.status === 200, json: async () => r.body }; };
const rewriteQuery = new Function('fetch', 'LLM_API', 'AI_OFF', 'AbortSignal', rwSrc + '\nreturn rewriteQuery;')(fakeFetch, 'http://x', false, { timeout: () => null });
const good = { status: 200, body: { queries: ['ค่าเล่าเรียน'], source: 'gemini' } };
for (const [label, bad] of [['HTTP 500', { status: 500, body: {} }], ['HTTP 429', { status: 429, body: {} }], ['all models failed', { status: 200, body: { queries: [], source: 'fallback' } }]]) {
  const q = 'q-' + label; replies.push(bad, good);
  const a = await rewriteQuery(q), b = await rewriteQuery(q);
  check(`F31: ${label} is retried on the next ask`, a.length === 0 && b[0] === 'ค่าเล่าเรียน' && replies.length === 0, JSON.stringify({ a, b, left: replies.length }));
}
replies.push(good); await rewriteQuery('q-ok'); const hit = await rewriteQuery('q-ok');
check('F31: a real answer is still cached (no second request)', hit[0] === 'ค่าเล่าเรียน' && replies.length === 0);

// G30: a strong advice hit counts once; 'saved' only where no LLM was called
check('G30: the advice branch bumps auto exactly once', (advice.match(/auto\+\+/g) || []).length === 1, advice.match(/auto\+\+[^\n]*/g));
check('G31: the LLM-rephrased mid path earns no "saved"', (advice.match(/saved\+=COST/g) || []).length === 1 && /take\('advice_strong'\)\)\{[\s\S]*?saved\+=COST/.test(advice));
check('G30: a disambiguation list counts and saves like any no-LLM answer', /rethink found two close candidates[^\n]*\n\s*auto\+\+; saved\+=COST;/.test(core));
// G31: outcome, not code path
check('G31: an understand-resolved answer moves from not-found to answered', /uid='un'\+\(\+\+fbN\);\n\s*ai--; auto\+\+;/.test(core));
check('G31: "not this" moves it back, once', /auto--; ai\+\+; paintBar\(\); showNotFound\(u\.others\); \}, \{once:true\}/.test(core));
check('G31: the topic picker is not counted as a hand-off', /PIN = e; \$\('q'\)\.value = e\.title; ask\(\); \}\)\);\n\s*ai--; auto\+\+; saved\+=COST;/.test(core));
check('G31: undoing a programme follow-up takes its own count back before re-asking', /auto--; saved-=COST; PCTX=null; \$\('q'\)\.value=q; ask\(\); \}, \{once:true\}/.test(core));
check('DRY: the counter bar is painted by paintBar() only', !/\$\('b-auto'\)\.textContent=auto/.test(html.replace(/function paintBar\(\)\{[^\n]*\}/, '')));

// F60: a late understand reply for an older question is dropped, and its spinner ends when the next question is asked
check('F60: the understand reply checks it is still the latest turn', /rewriteQuery\(q\)\.then\(phrases=>\{\n\s*wait\.remove\(\);\n\s*if\(myTurn!==askSeq\) return;/.test(core));
check('F60: a new question removes older pending spinners', /const myTurn=\+\+askSeq[^\n]*\n\s*\$\('chat'\)\.querySelectorAll\('\.msg\.pending'\)\.forEach\(e=>e\.remove\(\)\);/.test(core));
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
