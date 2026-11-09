//! The little dense algebra the kernel ridge fit needs (n ~ 500): Cholesky solve, cosine, a seeded random projection.

/// Solve (A) X = B for symmetric positive definite A (n x n, row-major) and B (n x m). Returns X (n x m).
pub fn cholesky_solve(a: &[f64], n: usize, b: &[f64], m: usize) -> Result<Vec<f64>, String> {
    let mut l = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..=i {
            let s: f64 = (0..j).map(|k| l[i * n + k] * l[j * n + k]).sum();
            match i == j {
                true => {
                    let d = a[i * n + i] - s;
                    if d <= 0.0 {
                        return Err(format!("matrix not positive definite at {i}"));
                    }
                    l[i * n + i] = d.sqrt();
                }
                false => l[i * n + j] = (a[i * n + j] - s) / l[j * n + j],
            }
        }
    }
    let mut x = b.to_vec();
    for c in 0..m {
        for i in 0..n {
            let s: f64 = (0..i).map(|k| l[i * n + k] * x[k * m + c]).sum();
            x[i * m + c] = (x[i * m + c] - s) / l[i * n + i];
        }
        for i in (0..n).rev() {
            let s: f64 = (i + 1..n).map(|k| l[k * n + i] * x[k * m + c]).sum();
            x[i * m + c] = (x[i * m + c] - s) / l[i * n + i];
        }
    }
    Ok(x)
}

pub fn cosine(a: &[f64], b: &[f64]) -> f64 {
    let (dot, na, nb) = a.iter().zip(b).fold((0.0, 0.0, 0.0), |(d, x, y), (p, q)| (d + p * q, x + p * p, y + q * q));
    match na > 0.0 && nb > 0.0 {
        true => dot / (na.sqrt() * nb.sqrt()),
        false => 0.0,
    }
}

/// A seeded Gaussian projection d_in -> k (Johnson-Lindenstrauss: cosines are kept approximately).
pub fn projection(d_in: usize, k: usize, seed: u64) -> Vec<f64> {
    let mut s = seed.max(1);
    let mut uni = move || {
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        (s >> 11) as f64 / (1u64 << 53) as f64
    };
    (0..d_in * k)
        .map(|_| {
            let (u1, u2) = (uni().max(1e-300), uni());
            (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos() / (k as f64).sqrt()
        })
        .collect()
}

pub fn project(v: &[f64], r: &[f64], k: usize) -> Vec<f64> {
    (0..k).map(|j| v.iter().enumerate().map(|(i, x)| x * r[i * k + j]).sum()).collect()
}

/// Symmetric int8 quantisation per row (what a shipped table would store), returned de-quantised for honest scoring.
pub fn int8_roundtrip(row: &[f64]) -> Vec<f64> {
    let max = row.iter().fold(0.0_f64, |m, x| m.max(x.abs()));
    match max > 0.0 {
        true => row.iter().map(|x| (x / max * 127.0).round() / 127.0 * max).collect(),
        false => row.to_vec(),
    }
}
