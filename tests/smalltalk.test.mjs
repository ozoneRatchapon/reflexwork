// Unit tests for the smalltalk + affect kernel (web + LINE lockstep layer).
// Run: node tests/smalltalk.test.mjs   (exit 0 = pass, 1 = fail)
//
// Load-bearing cases: SARCASM must NOT be read as cheerful smalltalk (the
// uncanny tell), genuine greetings/thanks must still classify, and the mood
// state machine must shift deterministically with the conversation. This layer
// is deterministic (regex + a tiny state machine) — NO sentiment model — so the
// guard errs toward "treat as a real message" (the safe failure: a real
// question routed to the kernel beats a cheery reply to a complaint).
import {
  createMood, classifySmalltalk, smalltalkReply, scoreSmalltalk,
} from '../integrations/_shared/smalltalk.mjs';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
};
const truthy = (name, got) => { const ok = !!got; console.log((ok ? '✓' : '✗') + ' ' + name); ok ? pass++ : fail++; };

// --- genuine smalltalk classifies -------------------------------------------
eq('greeting', classifySmalltalk('สวัสดีครับ'), 'greet');
eq('greeting en', classifySmalltalk('hello'), 'greet');
eq('thanks', classifySmalltalk('ขอบคุณมากครับ'), 'thanks');
eq('thanks + genuine praise', classifySmalltalk('ขอบคุณครับ ช่วยได้มากเลย'), 'thanks');
eq('praise word alone', classifySmalltalk('สุดยอด'), 'thanks');
eq('whatcan', classifySmalltalk('ทำอะไรได้บ้าง'), 'whatcan');
eq('howareyou', classifySmalltalk('สบายดีไหม'), 'howareyou');
eq('bye', classifySmalltalk('บาย'), 'bye');

// --- SARCASM must fall through (NOT cheerful smalltalk) ----------------------
eq('sarcastic thanks (ไม่ช่วย)', classifySmalltalk('ขอบคุณที่ไม่ช่วยอะไรเลย'), null);
eq('sarcastic thanks (ไม่ตรง)', classifySmalltalk('ขอบคุณมากที่ตอบไม่ตรงคำถาม'), null);
eq('ironic praise (เก่ง...ไม่ได้)', classifySmalltalk('เก่งจังเลยนะ ตอบไม่ได้สักข้อ'), null);
eq('ironic praise (ฉลาด...ผิด)', classifySmalltalk('ว้าว ฉลาดมาก ตอบผิดหมดเลย'), null);
eq('ironic praise (สุดยอด...ไม่ช่วย)', classifySmalltalk('สุดยอดเลย ไม่ช่วยอะไรได้เลย'), null);
eq('ironic praise (เยี่ยม...ห่วย)', classifySmalltalk('เยี่ยมมาก บอทนี้ห่วยสุดๆ'), null);
eq('sarcastic thanks (ทำพัง)', classifySmalltalk('ขอบใจนะที่ทำพัง'), null);
eq('sarcastic thanks en', classifySmalltalk('thanks a lot, you were useless'), null);
eq('ironic praise en', classifySmalltalk("great job, doesn't work at all"), null);
eq('sarcastic howareyou', classifySmalltalk('สบายดีไหม บอทที่ตอบอะไรไม่ได้'), null);

// --- not smalltalk at all (goes to kernel/KB) -------------------------------
eq('plain complaint → kernel', classifySmalltalk('บอทนี้ห่วยมาก'), null);
eq('empty → null', classifySmalltalk('   '), null);
eq('greeting + real question → kernel', classifySmalltalk('สวัสดีครับ ค่าสอบเท่าไร'), null);
eq('typo factual (no tones) → kernel', classifySmalltalk('คาสอบเทาไหร่'), null);
eq('english factual → kernel', classifySmalltalk('how much is the exam fee'), null);

// --- affect kernel: deterministic mood transitions --------------------------
const m = createMood();
eq('start neutral face', m.snapshot().emoji, '🦀');
m.felt('hit');
eq('after 1 hit → ok', m.snapshot().hue, 'ok');
m.felt('hit');
eq('after 2 hits → warm', m.snapshot().hue, 'warm');
m.felt('miss');
eq('after a miss → concerned', m.snapshot().hue, 'miss');
truthy('empathy line after miss', m.empathy().includes('ขอโทษ'));
m.felt('hit');
// valence = 0.2 +0.25 +0.25 −0.35 +0.25 = 0.60 → warm; and a hit clears the
// lastWasMiss flag so we're no longer in the 'miss' (concerned) hue.
eq('recovers after miss (no longer concerned)', m.snapshot().hue, 'warm');

// mood is a pure function of valence — snapshot never throws, always labelled
truthy('snapshot always has a label', createMood().snapshot().label.length > 0);

// --- frustration = BEHAVIOR signal (repeated misses → proactive escalation) --
const fm = createMood();
eq('not frustrated at start', fm.frustrated(), false);
fm.felt('miss');
eq('one miss → not yet frustrated', fm.frustrated(), false);
fm.felt('miss');
eq('two misses in a row → frustrated', fm.frustrated(), true);
fm.felt('hit');
eq('a hit clears frustration', fm.frustrated(), false);

// --- scorer exposes the gate value (auditability) ---------------------------
truthy('scoreSmalltalk returns a gate score', (scoreSmalltalk('สวัสดีครับ') || {}).score > 0.5);
eq('scoreSmalltalk null on a real question', scoreSmalltalk('ค่าสอบเท่าไร'), null);

// --- replies are non-empty for every kind -----------------------------------
for (const k of ['greet', 'thanks', 'bye', 'whatcan', 'howareyou']) {
  truthy(`reply for ${k} non-empty`, smalltalkReply(k, m).length > 0);
}

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
