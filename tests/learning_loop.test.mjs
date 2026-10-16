#!/usr/bin/env node
// Unit tests for ReflexWork learning-loop pure logic (zero dependency).
// Run: node tests/learning_loop.test.mjs   (exit 0 = pass, 1 = fail)
import { classifyIssue, isAdvice } from '../integrations/_shared/intake.mjs';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
};

// --- intake: advice vs factual ----------------------------------------------
eq('isAdvice advice', isAdvice('แนะนำวิธีวางแผนทำวิทยานิพนธ์'), true);
eq('isAdvice factual', isAdvice('ส่งเล่มกี่วัน'), false);
eq('isAdvice cost', isAdvice('ค่าสอบเท่าไร'), false);

// --- intake: personal issue classification ----------------------------------
eq('classify login', classifyIssue('เข้าล็อกอิน we mahidol ไม่ได้')?.category, 'login');
eq('classify data', classifyIssue('ข้อมูลค้างในระบบ')?.category, 'data_stuck');
eq('classify faq (none)', classifyIssue('ส่งเล่มกี่วัน'), null);

// --- maskPII (mirror of kernel-worker maskPII) ------------------------------
function maskPII(s){return String(s||'')
  .replace(/[\w.+-]+@[\w.-]+\.\w+/g,'[email]')
  .replace(/\b0\d[\d\s-]{7,}\d\b/g,'[phone]')
  .replace(/\b\d{7,}\b/g,'[id]')
  .replace(/\b[gG]\d{6,}\b/g,'[id]');}
eq('mask email', maskPII('ติดต่อ a@b.mahidol.ac.th'), 'ติดต่อ [email]');
eq('mask phone', maskPII('โทร 02-849-6022'), 'โทร [phone]');
eq('mask id', maskPII('รหัส 6938569'), 'รหัส [id]');
eq('mask none', maskPII('ส่งเล่มกี่วัน'), 'ส่งเล่มกี่วัน');

// --- EMA confidence (mirror of feedback handler) ----------------------------
function ema(prev, reward){ const target = reward>=0?1:0; return Math.max(0,Math.min(1, 0.85*prev + 0.15*target)); }
eq('ema downvote from 1.0', Number(ema(1.0,-1).toFixed(3)), 0.85);
eq('ema 3x downvote', Number(ema(ema(ema(1.0,-1),-1),-1).toFixed(3)), 0.614);
eq('ema upvote stays high', ema(1.0, 1), 1);

// --- slug derivation (mirror of kbApprove) ----------------------------------
function slug(title, id){ const a=String(title).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); return (a.length>=3?a:`kb_draft_${id}`).slice(0,40); }
eq('slug ascii', slug('Visa process international', 1), 'visa_process_international');
eq('slug thai fallback', slug('ขอหนังสือรับรอง', 7), 'kb_draft_7');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
