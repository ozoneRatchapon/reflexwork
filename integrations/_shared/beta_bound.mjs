// Vote-count bounds for a KB entry, from katgpt-rs crates/katgpt-core/src/best_belief.rs (Best-Belief, katgpt Bench 010: 15-30% less
// selection regret than the raw rate when vote counts differ). Posterior Beta(1+up, 1+down) (uniform prior); the q-quantile is the value
// the entry's true "helpful" rate exceeds with probability 1-q.
//   lo = quantile 0.05 -> "at least lo with 95% confidence"  (rank the BEST entries: 2/2 no longer beats 50/60)
//   hi = quantile 0.95 -> "at most hi with 95% confidence"   (rank entries TO FIX: few votes stay near the top only if they are all bad)
// Pure math, no state. Regularized incomplete Beta by the Numerical Recipes continued fraction (Lentz), inverted by bisection.

function ln_gamma(x) {   // Lanczos, g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - ln_gamma(1 - x);
  x -= 1; let a = c[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function beta_cf(x, a, b) {
  const TINY = 1e-300; let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}
// I_x(a, b): the probability that a Beta(a, b) variable is <= x
export function beta_cdf(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const ln_front = ln_gamma(a + b) - ln_gamma(a) - ln_gamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  return x < (a + 1) / (a + b + 2) ? Math.exp(ln_front) * beta_cf(x, a, b) / a : 1 - Math.exp(ln_front) * beta_cf(1 - x, b, a) / b;
}
export function beta_quantile(q, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (beta_cdf(mid, a, b) < q) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
// The per-entry summary the dashboard shows. up/down are vote counts (non-negative integers).
export function vote_bounds(up, down) {
  const u = Math.max(0, Math.floor(Number(up) || 0)), d = Math.max(0, Math.floor(Number(down) || 0));
  const a = 1 + u, b = 1 + d;
  return { lo: beta_quantile(0.05, a, b), hi: beta_quantile(0.95, a, b), mean: a / (a + b), n: u + d };
}
