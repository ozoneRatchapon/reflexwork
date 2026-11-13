// ReflexWork — what LINE replies for each route of the shared Rust decision order (plan 009 C4).
//
// The ROUTE is decided in Rust (the same Router as the web page, crates/reflex-wasm/src/route): this module only turns the router's
// decision ({route, entry, offered, kind, stage, personal, stuck}) into LINE text. LINE has no cards, chips or buttons, so a list is
// numbered titles the user can type back, and "staff continue in this chat" replaces the page's contact buttons.
//
// The LINE contract: the routes the LINE state can reach (no programme catalogue, no topic pin, no programme in focus, no AI rewrite),
// recorded in benchmark/golden/line_route.json and checked by crates/reflex-wasm/tests/golden_line.rs. A route outside LINE_ROUTES
// would be a decision LINE cannot show: it falls back to the not-found reply (and tests/line_route.test.mjs fails on it).
import { readableText } from '../_shared/answer_points.mjs';
import { intakePrompt } from '../_shared/intake.mjs';
import { createMood, smalltalkReply } from '../_shared/smalltalk.mjs';

export const LINE_ROUTES = new Set([
  'wellbeing', 'smalltalk', 'personal', 'stuck_pick', 'restart', 'overview', 'time_intent',
  'scope_ask', 'scope_no_year', 'scope_no_round', 'advice_abstain', 'advice_strong', 'advice_hybrid', 'kb_act', 'disambiguate',
  'not_a_question', 'other_script', 'english_off_corpus', 'intake', 'topic_picks',
]);

// Spoken polite Thai, same voice as the page's VOICE (tests/voice_lint.test.mjs), without the page's on-screen buttons.
const T = {
  staffHere:     'เจ้าหน้าที่จะตอบต่อในแชทนี้ครับ',
  notInManual:   'เรื่องนี้ยังไม่มีในคู่มือครับ ผมจดคำถามไว้ให้ทีมเติมแล้ว และเจ้าหน้าที่จะตอบต่อในแชทนี้',
  nearHead:      'ระหว่างนี้ หัวข้อใกล้เคียงที่ถามได้:',
  wbCrisis:      'ขอบคุณที่บอกนะครับ เรื่องนี้สำคัญมาก ถ้าตอนนี้ไม่ปลอดภัยหรือกำลังคิดทำร้ายตัวเอง โปรดติดต่อบริการฉุกเฉิน (1669) หรือคนที่ไว้ใจให้มาอยู่ด้วยทันที ไม่ต้องอยู่คนเดียวนะครับ',
  wbStress:      'ฟังแล้วเป็นห่วงนะครับ ความรู้สึกแบบนี้เกิดขึ้นได้ และมีคนช่วยได้ ลองดูช่องทางให้คำปรึกษาด้านล่างได้เลยครับ',
  wbStaff:       'ถ้าอยากคุยกับเจ้าหน้าที่ พิมพ์บอกในแชทนี้ได้เลยครับ',
  personalSelf:  'ข้อมูลส่วนตัวของคุณ เช่น ผลสอบ เกรด ยอดค้างชำระ หรือสถานะคำร้อง ดูให้ไม่ได้ครับ แชตนี้ไม่ได้เชื่อมกับระบบของมหาวิทยาลัยและไม่มีการเข้าสู่ระบบ',
  personalWhy:   'ผมจึงไม่เดา และไม่ตอบข้อมูลทั่วไปแทน เพราะอาจทำให้เข้าใจว่าเป็นของคุณ',
  personalOther: 'ข้อมูลของบุคคลอื่น หรือการค้นด้วยรหัส ผมแสดงให้ไม่ได้ครับ ให้เจ้าของข้อมูลมาถามเอง หรือติดต่อเจ้าหน้าที่',
  personalPrep:  'ถ้าต้องการให้เจ้าหน้าที่ดูให้ เตรียมรหัสนักศึกษา ชื่อหลักสูตร และเรื่องที่ต้องการไว้ เจ้าหน้าที่จะตอบต่อในแชทนี้ครับ',
  stuckLead:     'ไม่เป็นไรครับ ติดปัญหาเรื่องไหนครับ พิมพ์หัวข้อด้านล่าง หรือเล่าสั้น ๆ ว่าติดตรงไหนก็ได้:',
  stuckTopic:    'เรื่อง{w}ในคู่มือมีหัวข้อเหล่านี้ครับ พิมพ์หัวข้อที่ใกล้ที่สุดได้เลย ถ้ายังไม่ตรง เล่าสั้น ๆ ว่าติดตรงไหนครับ:',
  restart:       'ได้ครับ เริ่มใหม่ได้เลย พิมพ์เรื่องที่อยากถาม เช่น {topics}',
  overview:      'คำถามกว้างแบบนี้มีหลายเรื่องครับ ผมไม่อยากเดาคำตอบเดียว พิมพ์เรื่องที่อยากรู้ได้เลย เช่น {topics}',
  timeLead:      'วันนี้ {today} ครับ นี่คือกำหนดการในคู่มือที่ใกล้วันนี้ที่สุด พิมพ์หัวข้อเพื่อดูวันที่ครบ:',
  scopeAsk:      'เรื่องนี้คำตอบไม่เหมือนกันในแต่ละปีการศึกษาหรือภาคเรียนครับ หมายถึงอันไหน? พิมพ์หัวข้อที่ตรงได้เลย:',
  scopeNoYear:   'ตอนนี้คู่มือยังไม่มีข้อมูลที่ยืนยันแล้วของปีการศึกษาที่ถามครับ ผมจึงไม่เอาข้อมูลของปีอื่นมาตอบแทน เจ้าหน้าที่จะตอบต่อในแชทนี้',
  scopeNoRound:  'คู่มือยังไม่มีกำหนดการรับสมัครของรอบที่ถามครับ ผมจึงไม่เอาข้อมูลของรอบอื่นมาตอบแทน พิมพ์ชื่อหลักสูตรเพื่อดูตัดรอบของหลักสูตรนั้น หรือรอเจ้าหน้าที่ตอบในแชทนี้ได้ครับ',
  adviceAbstain: 'เรื่องนี้เป็นคำถามขอคำแนะนำที่คู่มือยังตอบได้ไม่ครบครับ ผมไม่อยากตอบพลาด เลยจดคำถามไว้ให้ทีมคู่มือแล้ว และเจ้าหน้าที่จะตอบต่อในแชทนี้',
  disambiguate:  '🤔 ไม่แน่ใจว่าหมายถึงข้อไหน ลองพิมพ์หัวข้อที่ตรงที่สุด:',
  notAQuestion:  'พิมพ์คำถามที่อยากรู้ได้เลยครับ เช่น "{ex}"',
  otherScript:   'ขออภัยครับ ตอนนี้ผมตอบได้เป็นภาษาไทยและภาษาอังกฤษ ผมจดคำถามไว้ให้ทีมแล้ว และเจ้าหน้าที่จะตอบต่อในแชทนี้\nSorry, I can answer in Thai or English only. Staff will reply in this chat.',
  english:       'This is not in the knowledge base yet. I have noted your question for the team, and staff will reply in this chat.',
  topicPick:     'ในคู่มือมีหัวข้อเหล่านี้ครับ พิมพ์หัวข้อที่ต้องการได้เลย:',
};
// The stuck areas (the page's _STUCK_VIEW names; which area and which entries is Rust's, vocab.json stuck_cats)
const STUCK = {
  login:  { name: 'การเข้าระบบและบัญชี', asks: 'เข้าระบบไม่ได้' },
  reg:    { name: 'ลงทะเบียนและชำระเงิน', asks: 'ติดปัญหาเรื่องลงทะเบียน' },
  thesis: { name: 'วิทยานิพนธ์และการส่งเล่ม', asks: 'ติดปัญหาเรื่องวิทยานิพนธ์' },
  status: { name: 'ลาพัก ลาออก และสถานภาพ', asks: 'ติดปัญหาเรื่องลาพัก' },
  grad:   { name: 'การขอจบและเอกสาร', asks: 'ติดปัญหาเรื่องขอจบ' },
};
const WELLBEING_ENTRY = 'gm_mental_wellbeing_navigation';
// The Graduate School's example topics. Another agency's worker passes ctx.voice = {persona, examples} from its agency.json (pack-line-kb
// --agency writes it into the KB module as LINE_VOICE), so restart / overview / small talk name its own topics (plan 019 item 6.2).
const GRAD_TOPICS = 'สมัครเรียน ค่าเทอม ทุน ลงทะเบียน ส่งวิทยานิพนธ์', GRAD_EXAMPLE = 'ลาพักการศึกษาต้องทำอย่างไร', VOICE_EXAMPLES = 4;
const examplesOf = voice => (voice && Array.isArray(voice.examples) ? voice.examples : []).filter(q => typeof q === 'string' && q.trim());
const topicsOf = voice => { const ex = examplesOf(voice).slice(0, VOICE_EXAMPLES); return ex.length ? ex.map(q => `"${q}"`).join(' · ') : GRAD_TOPICS; };

const numbered = titles => titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
const thaiDate = iso => new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** The manual answer as LINE text: the answer as points, the steps numbered, the source link. */
export function entryText(entry, q) {
  const steps = Array.isArray(entry.steps) && entry.steps.length ? `\n\nทำตามขั้นตอน:\n${numbered(entry.steps)}` : '';
  const src = entry.source_url ? `\n📎 ${entry.source_url}` : '';
  return `${readableText(entry, q)}${steps}${src}`;
}

/** "Not in the manual" with the nearest titles (only those that share real words with the question). */
export function notInManualText(near) {
  return [T.notInManual, near.length ? `${T.nearHead}\n${numbered(near)}` : ''].filter(Boolean).join('\n\n');
}

/**
 * One LINE reply for one decision. Pure: no network. `ctx` = {byId: Map id->entry, near: () => titles, issue: () => {category,label}|null, today,
 * voice?: {persona, examples} of another agency (absent: the Graduate School's lines)}.
 * Returns {text, footer: {student, judge}, gap: log the question for the staff backlog, ai: {entry, offered} when the answer may be rephrased
 * by the grounded AI (the caller does that, and keeps `text` as the fallback)}.
 */
export function lineView(d, q, ctx) {
  const route = d && LINE_ROUTES.has(d.route) ? d.route : null;
  const entries = ids => (ids || []).map(id => ctx.byId.get(id)).filter(Boolean);
  const titles = ids => entries(ids).map(e => e.title);
  const tag = d && d.stage === 'rethink' ? ' 🔁 rethink' : '';
  const view = (text, judge, extra = {}) => ({ text, footer: { student: extra.student ?? '', judge }, gap: false, ai: null, ...extra });
  switch (route) {
    case 'wellbeing': {
      const e = ctx.byId.get(WELLBEING_ENTRY);
      return view([d.kind === 'crisis' ? T.wbCrisis : T.wbStress, e ? entryText(e, q) : '', T.wbStaff].filter(Boolean).join('\n\n'), '💚 ดูแลใจก่อน · ไม่เรียก AI');
    }
    case 'smalltalk': {
      const mood = createMood().felt(d.kind === 'thanks' ? 'thanks' : 'neutral');   // LINE is stateless per webhook: the mood starts fresh
      return view(smalltalkReply(d.kind, mood, ctx.voice?.persona || null), '💬 คุยทั่วไป · ไม่เรียก AI · 0 token');
    }
    case 'personal':
      return view(`${d.personal === 'other' ? T.personalOther : `${T.personalSelf}\n${T.personalWhy}`}\n\n${T.personalPrep}`, '🔒 ข้อมูลส่วนตัว — ดูให้ไม่ได้ · ไม่เรียก AI');
    case 'stuck_pick': {
      const st = d.stuck || {}, area = st.key ? STUCK[st.key] : null;
      const list = area ? titles(st.picks) : (st.areas || []).map(k => STUCK[k]?.asks).filter(Boolean);
      return view(`${area ? T.stuckTopic.replace('{w}', area.name) : T.stuckLead}\n${numbered(list)}\n\n${T.staffHere}`, '🧭 ติดปัญหา → ถามกลับว่าเรื่องไหน · ไม่เรียก AI');
    }
    case 'restart':
      return view(T.restart.replace('{topics}', topicsOf(ctx.voice)), '🧭 เริ่มใหม่ · ไม่เรียก AI');
    case 'overview':
      return view(T.overview.replace('{topics}', topicsOf(ctx.voice)), '🧭 คำถามกว้าง · ไม่เรียก AI');
    case 'time_intent':
      return view(`${T.timeLead.replace('{today}', thaiDate(ctx.today))}\n${numbered(titles(d.offered))}`, '📅 เทียบกับวันนี้ · ไม่เรียก AI');
    case 'scope_ask':
      return view(`${T.scopeAsk}\n${numbered(titles(d.offered))}`, `🗓️ คำตอบต่างตามปี/ภาค → ถามก่อน · ไม่เรียก AI${tag}`);
    case 'scope_no_year':
      return view(T.scopeNoYear, `🗓️ ไม่มีข้อมูลปีนั้น · ไม่แทนด้วยปีอื่น${tag}`);
    case 'scope_no_round':
      return view(T.scopeNoRound, `🗓️ ไม่มีข้อมูลรอบนั้น · ไม่แทนด้วยรอบอื่น${tag}`);
    case 'advice_abstain':
      return view(T.adviceAbstain, `🦀 คำถามขอคำแนะนำ · คู่มือตรงไม่พอ · ไม่ให้ AI เดา · ส่งต่อเจ้าหน้าที่${tag}`, { gap: true });
    case 'advice_strong':
    case 'advice_hybrid':
    case 'kb_act': {
      const e = ctx.byId.get(d.entry);
      if (!e) break;   // the router named an entry LINE does not have: say not found rather than guess
      const ai = route === 'kb_act' ? null : { entry: e, offered: entries(d.offered) };
      return view(entryText(e, q), `🦀 FastPath · ตอบจากคู่มือ · 0 token${tag}`, { student: '✅ ข้อมูลทางการจากคู่มือ', ai });
    }
    case 'disambiguate':
      return view(`${T.disambiguate}\n${numbered(titles(d.offered))}`, `🦀 ต้องการความชัดเจน · ยังไม่เรียก AI${tag}`);
    case 'not_a_question':
      return view(T.notAQuestion.replace('{ex}', examplesOf(ctx.voice)[0] || GRAD_EXAMPLE), '💬 ยังไม่ใช่คำถาม · ไม่เรียก AI');
    case 'other_script':
      return view(T.otherScript, '🦀 ภาษาอื่น · ไม่ให้ AI แปลเดา · ส่งต่อเจ้าหน้าที่', { gap: true });
    case 'english_off_corpus':
      return view(T.english, '🦀 English · not in the manual · no AI guess · staff', { gap: true });
    case 'intake': {
      const issue = ctx.issue();
      return view(intakePrompt(issue && issue.category), `🦀 คัดเป็น “${issue ? issue.label : 'ปัญหาเฉพาะบุคคล'}” · ส่งต่อเจ้าหน้าที่ (เก็บข้อมูลให้ครบก่อน)`);
    }
    case 'topic_picks':
      return view(`${T.topicPick}\n${numbered(titles(d.offered))}\n\n${T.staffHere}`, '📚 หัวข้อในคู่มือที่มีคำนี้ · ไม่เรียก AI', { gap: true });
    default:
      break;
  }
  return view(notInManualText(ctx.near()), `🦀 ไม่พบในคู่มือ · ไม่ให้ AI เดา · ส่งต่อเจ้าหน้าที่${tag}`, { gap: true });
}
