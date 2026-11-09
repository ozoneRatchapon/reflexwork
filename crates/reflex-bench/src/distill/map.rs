//! Kernel ridge from binary L2-normalised trigram sets to a target vector space: q = sum_i k(q, x_i) alpha_i,
//! alpha = (K + lambda I)^-1 Y, k(a, b) = |a & b| / sqrt(|a| |b|). The same model as benchmark/synth/distill.mjs (Woodbury form).
use std::collections::HashSet;

use super::linalg::{cholesky_solve, cosine, int8_roundtrip};

pub type Grams = HashSet<String>;

pub fn grams(text: &str) -> Grams {
    reflex_wasm::gram_set(text).into_iter().collect()
}

pub fn kernel(a: &Grams, b: &Grams) -> f64 {
    match (a.len(), b.len()) {
        (0, _) | (_, 0) => 0.0,
        (la, lb) => {
            let (small, big) = if la <= lb { (a, b) } else { (b, a) };
            small.iter().filter(|g| big.contains(*g)).count() as f64 / ((la * lb) as f64).sqrt()
        }
    }
}

pub struct DistilledMap {
    train: Vec<Grams>,
    /// n x d, row-major
    alpha: Vec<f64>,
    d: usize,
}

impl DistilledMap {
    pub fn fit(train: Vec<Grams>, targets: &[Vec<f64>], lambda: f64) -> Result<DistilledMap, String> {
        let n = train.len();
        let d = targets.first().map_or(0, Vec::len);
        let mut k = vec![0.0; n * n];
        for i in 0..n {
            for j in 0..=i {
                let v = kernel(&train[i], &train[j]);
                k[i * n + j] = v;
                k[j * n + i] = v;
            }
            k[i * n + i] += lambda;
        }
        let y: Vec<f64> = targets.iter().flatten().copied().collect();
        let alpha = cholesky_solve(&k, n, &y, d)?;
        Ok(DistilledMap { train, alpha, d })
    }

    /// The shipped form stores alpha as int8 rows: score with exactly that.
    pub fn quantised(mut self) -> DistilledMap {
        let d = self.d;
        self.alpha = self.alpha.chunks(d).flat_map(int8_roundtrip).collect();
        self
    }

    pub fn predict(&self, q: &Grams) -> Vec<f64> {
        let mut out = vec![0.0; self.d];
        for (i, x) in self.train.iter().enumerate() {
            let w = kernel(q, x);
            if w != 0.0 {
                for (o, a) in out.iter_mut().zip(&self.alpha[i * self.d..(i + 1) * self.d]) {
                    *o += w * a;
                }
            }
        }
        out
    }

    /// Cosine of the predicted vector to each entry vector (same order as `entries`).
    pub fn scores(&self, q: &Grams, entries: &[Vec<f64>]) -> Vec<f64> {
        let v = self.predict(q);
        entries.iter().map(|e| cosine(&v, e)).collect()
    }

    /// Bytes a shipped table would hold: the train trigram sets (UTF-8, newline-separated) + int8 alpha + one scale per row.
    pub fn artifact(&self, entries: &[Vec<f64>]) -> Vec<u8> {
        let mut b = Vec::new();
        for g in &self.train {
            let mut v: Vec<&str> = g.iter().map(String::as_str).collect();
            v.sort_unstable();
            b.extend_from_slice(v.join("\u{1f}").as_bytes());
            b.push(b'\n');
        }
        for row in self.alpha.chunks(self.d).chain(entries.iter().map(Vec::as_slice)) {
            let max = row.iter().fold(0.0_f64, |m, x| m.max(x.abs())).max(1e-12);
            b.extend_from_slice(&(max as f32).to_le_bytes());
            b.extend(row.iter().map(|x| ((x / max * 127.0).round() as i8) as u8));
        }
        b
    }
}
