use super::types::{Hit, Understood};

/// A hit counts as clear when it scores at least this and leads the runner-up by `CLEAR_LEAD` (the bar of a direct answer).
const CLEAR_SCORE: f64 = 4.0;
const CLEAR_LEAD: f64 = 2.0;
/// How many alternatives ("not this") and choices the page shows.
const MAX_SHOWN: usize = 3;

struct Clear<'a> {
    id: &'a str,
    score: f64,
    via: &'a str,
}

/// Port of `understand(phrases)`. `results[i]` is the search result of `phrases[i]`, best first (the top three are enough).
pub fn understand(phrases: &[String], results: &[Vec<Hit>]) -> Understood {
    let clear: Vec<Clear> = phrases
        .iter()
        .zip(results)
        .filter_map(|(via, r)| {
            let top = r.first()?;
            let lead_ok = r.get(1).is_none_or(|second| top.score - second.score >= CLEAR_LEAD);
            (top.score >= CLEAR_SCORE && lead_ok).then_some(Clear { id: &top.id, score: top.score, via })
        })
        .collect();
    let mut ids: Vec<&str> = Vec::new();
    for c in &clear {
        if !ids.contains(&c.id) {
            ids.push(c.id);
        }
    }
    // One clear hit among several phrases is not enough (measured 2026-11-03: wrong in 2 of 6): two phrases must agree,
    // or the model gave a single phrase.
    let agree = ids.len() == 1 && (clear.len() >= 2 || phrases.len() == 1);
    match (agree, ids.len()) {
        (true, _) => {
            // `clear.sort(desc)[0]`: the highest score, the first one on a tie
            let best = clear.iter().skip(1).fold(&clear[0], |b, c| if c.score > b.score { c } else { b });
            let flat: Vec<&str> = results.iter().flat_map(|r| r.iter().take(MAX_SHOWN)).map(|h| h.id.as_str()).collect();
            let others = flat
                .iter()
                .enumerate()
                .filter(|(i, id)| **id != best.id && flat.iter().position(|x| x == *id) == Some(*i))
                .map(|(_, id)| (*id).to_owned())
                .take(MAX_SHOWN)
                .collect();
            Understood::One { id: best.id.to_owned(), score: best.score, via: best.via.to_owned(), others }
        }
        (false, n) if n > 1 => Understood::Many { ids: ids.iter().take(MAX_SHOWN).map(|s| (*s).to_owned()).collect() },
        _ => Understood::None,
    }
}
