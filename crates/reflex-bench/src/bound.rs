//! Clopper-Pearson (exact binomial) one-sided upper bound, the `cp_upper` of katgpt-rs `certified_frontier.rs`, written here
//! from the definition: the p with P(X <= k | n, p) = delta, i.e. the (1 - delta) quantile of Beta(k + 1, n - k).

/// ln Gamma by the Lanczos approximation (g = 7, 9 terms); good to ~1e-13 for x > 0.
fn ln_gamma(x: f64) -> f64 {
    const C: [f64; 9] = [
        0.999_999_999_999_809_9,
        676.520_368_121_885_1,
        -1_259.139_216_722_402_8,
        771.323_428_777_653_1,
        -176.615_029_162_140_6,
        12.507_343_278_686_905,
        -0.138_571_095_265_720_12,
        9.984_369_578_019_572e-6,
        1.505_632_735_149_311_6e-7,
    ];
    match x < 0.5 {
        true => std::f64::consts::PI.ln() - (std::f64::consts::PI * x).sin().ln() - ln_gamma(1.0 - x),
        false => {
            let x = x - 1.0;
            let t = x + 7.5;
            let a = C[1..].iter().enumerate().fold(C[0], |a, (i, c)| a + c / (x + i as f64 + 1.0));
            0.5 * (2.0 * std::f64::consts::PI).ln() + (x + 0.5) * t.ln() - t + a.ln()
        }
    }
}

/// Continued fraction for the incomplete beta (modified Lentz).
fn beta_cf(a: f64, b: f64, x: f64) -> f64 {
    const TINY: f64 = 1e-300;
    let (qab, qap, qam) = (a + b, a + 1.0, a - 1.0);
    let mut c = 1.0;
    let mut d = 1.0 - qab * x / qap;
    d = if d.abs() < TINY { TINY } else { d };
    d = 1.0 / d;
    let mut h = d;
    for m in 1..=300 {
        let m = m as f64;
        let m2 = 2.0 * m;
        for aa in [m * (b - m) * x / ((qam + m2) * (a + m2)), -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))] {
            d = 1.0 + aa * d;
            d = if d.abs() < TINY { TINY } else { d };
            c = 1.0 + aa / c;
            c = if c.abs() < TINY { TINY } else { c };
            d = 1.0 / d;
            h *= d * c;
        }
        if (d * c - 1.0).abs() < 1e-15 {
            break;
        }
    }
    h
}

/// Regularized incomplete beta I_x(a, b).
pub fn reg_inc_beta(a: f64, b: f64, x: f64) -> f64 {
    match x {
        x if x <= 0.0 => 0.0,
        x if x >= 1.0 => 1.0,
        _ => {
            let ln_front = ln_gamma(a + b) - ln_gamma(a) - ln_gamma(b) + a * x.ln() + b * (1.0 - x).ln();
            match x < (a + 1.0) / (a + b + 2.0) {
                true => ln_front.exp() * beta_cf(a, b, x) / a,
                false => 1.0 - ln_front.exp() * beta_cf(b, a, 1.0 - x) / b,
            }
        }
    }
}

/// One-sided upper bound on a rate after `k` events in `n` trials, at confidence 1 - `delta`. `n == 0` gives 1.0 (nothing known).
pub fn cp_upper(k: usize, n: usize, delta: f64) -> f64 {
    if n == 0 {
        return 1.0;
    }
    if k >= n {
        return 1.0;
    }
    let (a, b) = (k as f64 + 1.0, (n - k) as f64);
    let (mut lo, mut hi) = (k as f64 / n as f64, 1.0_f64);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        // I_mid(k+1, n-k) = P(X >= k+1 | n, mid); the bound is where that reaches 1 - delta
        match reg_inc_beta(a, b, mid) < 1.0 - delta {
            true => lo = mid,
            false => hi = mid,
        }
    }
    hi
}
