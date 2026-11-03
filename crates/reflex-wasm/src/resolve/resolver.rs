use super::index::{Catalogue, Entry};
use super::patterns::{patterns, Patterns, ALIASES};
use super::text::{includes, pieces, replace_ws, strip_zero_width, tone, tri, trim, u16s, Tri};
use super::types::{Kind, Resolution};

/// A candidate with its score.
struct Scored<'a> {
    entry: &'a Entry,
    score: f64,
}

/// One normalised needle (the programme name as the user typed it) and its trigrams.
struct Needle {
    text: Vec<u16>,
    tri: Tri,
}

/// `_pClean`: the question without filler at its start and end, spaces removed.
fn clean(q: &str, p: &Patterns) -> String {
    let lowered = strip_zero_width(&q.to_lowercase());
    let degrees = p.degree.replace_all(&lowered, " ");
    let quals = p.qual.replace_all(&degrees, " ");
    let mut s = trim(&replace_ws(&quals, " ")).to_owned();
    loop {
        let prev = s.clone();
        let cut = match p.lead.captures(&s) {
            // la1/la2 are lookaheads in the page: the match stops where they begin
            Some(c) => c.name("la1").or_else(|| c.name("la2")).map_or(c.get(0).map_or(0, |m| m.end()), |g| g.start()),
            None => 0,
        };
        let after_lead = &s[cut..];
        let after_tail = p.tail.replace(after_lead, "");
        let after_mi = p.trailing_mi.replace(&after_tail, "");
        s = trim(&after_mi).to_owned();
        if s == prev || s.is_empty() {
            break;
        }
    }
    replace_ws(&s, "")
}

/// `_pLevel`: the level letter named in the question (N, C, D, M), first rule wins.
fn level_of(q: &str, p: &Patterns) -> Option<char> {
    p.levels.iter().find(|(_, re)| re.is_match(q)).map(|(k, _)| *k)
}

/// The text the programme name is read from: topic and ask words are removed first.
fn name_text(q: &str, p: &Patterns) -> String {
    p.strip.iter().fold(q.to_owned(), |s, re| re.replace_all(&s, " ").into_owned())
}

fn needles(text: &str, alias: Option<usize>, p: &Patterns) -> Vec<Needle> {
    let raw: Vec<String> = match alias {
        Some(i) => ALIASES[i].1.iter().map(|s| replace_ws(s, "")).collect(),
        None => vec![clean(text, p)],
    };
    raw.into_iter()
        .filter(|n| !p.func.is_match(n)) // the function-word test comes BEFORE tone marks go ("เพื่อ" must still read as เพื่อ)
        .map(|n| tone(&n))
        .map(|n| Needle { tri: tri(&n), text: u16s(&n) })
        .filter(|n| n.tri.len() >= 2)
        .collect()
}

/// How well one programme matches the needles (0 = not at all). `loose` lowers the bar (slips such as "กายอุปกณ์").
fn score(entry: &Entry, needles: &[Needle], loose: bool) -> f64 {
    let bar = if loose { 0.5 } else { 0.85 };
    let mut best = 0.0f64;
    for n in needles {
        for (h, hg) in entry.names() {
            let hit = n.tri.iter().filter(|t| hg.contains(*t)).count();
            let cov = (hit as f64 / n.tri.len() as f64).max(pieces(&n.text, h));
            let exact = if h == n.text.as_slice() { 1.0 } else { 0.0 };
            let contained = if includes(h, &n.text) { 0.3 } else { 0.0 };
            if cov >= bar {
                let len_gap = (h.len() as f64 - n.text.len() as f64).abs() / 200.0;
                best = best.max(cov + exact + contained - 0.2f64.min(len_gap));
            }
            // the WHOLE programme name appears in the question, whatever filler surrounds it. Needs 4+ trigrams so short names
            // cannot match incidental text, and the name must be a real share (40%) of what was asked
            if hg.len() >= 4 && h == entry.core.as_slice() && h.len() as f64 >= 0.4 * n.text.len() as f64 {
                let in_q = hg.iter().filter(|t| n.tri.contains(*t)).count();
                if in_q == hg.len() {
                    best = best.max(1.0 + (h.len().min(40) as f64) / 50.0);
                }
            }
        }
    }
    best
}

fn one(entry: &Entry, via: &str, topic: &str, level_missing: bool) -> Resolution {
    Resolution { kind: Kind::One, codes: vec![entry.code.clone()], topic: topic.to_owned(), via: via.to_owned(), level_missing, total: None }
}

fn codes(entries: &[&Entry]) -> Vec<String> {
    entries.iter().map(|e| e.code.clone()).collect()
}

impl Catalogue {
    /// Port of `resolveProgramme(q, P, loose)`. `loose` is used only after the strict pass AND the manual found nothing: it answers
    /// with the nearest names, never a single card, so it cannot assert a wrong programme.
    pub fn resolve(&self, q: &str, loose: bool) -> Option<Resolution> {
        let p = patterns();
        if self.entries.is_empty() || p.other.is_match(q) {
            return None;
        }
        let fee_topic = p.topics.iter().find(|(_, re)| re.is_match(q)).map(|(k, _)| *k).unwrap_or("");
        let topic = if fee_topic.is_empty() { p.asks.iter().find(|(_, re)| re.is_match(q)).map_or("", |(k, _)| *k) } else { fee_topic };
        if let Some(c) = p.code.captures(&q.to_uppercase()) {
            let code = &c[1];
            return self.entries.iter().find(|e| e.code == code).map(|e| one(e, "code", topic, false));
        }
        let text = name_text(q, p);
        let alias = p.aliases.iter().position(|(_, re)| re.is_match(q));
        let level = level_of(q, p);
        let (intl, special) = (p.intl.is_match(q), p.special.is_match(q));
        let needles = needles(&text, alias, p);
        if needles.is_empty() {
            return None;
        }
        let intent_ok = p.intent.is_match(q) || alias.is_some() || !topic.is_empty();
        let mut scored: Vec<Scored> = self.entries.iter().map(|e| Scored { entry: e, score: score(e, &needles, loose) }).filter(|s| s.score > 0.0).collect();
        if scored.is_empty() {
            return None;
        }
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal)); // stable, as in JS
        if loose {
            let top = scored[0].score;
            let near: Vec<&Scored> = scored.iter().filter(|s| s.score >= top - 0.3).take(5).collect();
            let rows: Vec<&Entry> = if near.len() < 3 { scored.iter().take(3).map(|s| s.entry).collect() } else { near.iter().map(|s| s.entry).collect() };
            return Some(Resolution { kind: Kind::Many, codes: codes(&rows), topic: String::new(), via: String::new(), level_missing: false, total: Some(scored.len()) });
        }
        if !intent_ok && !is_almost_just_a_name(&needles[0], scored[0].entry) {
            return None;
        }
        let top = scored[0].score;
        let mut pool: Vec<&Entry> = scored.iter().filter(|s| s.score >= top - 0.15).map(|s| s.entry).collect();
        let mut keep = |f: &dyn Fn(&Entry) -> bool| -> bool {
            let r: Vec<&Entry> = pool.iter().copied().filter(|e| f(e)).collect();
            let any = !r.is_empty();
            if any {
                pool = r;
            }
            any
        };
        let level_missing = level.is_some_and(|l| !keep(&|e: &Entry| e.code.chars().nth(4) == Some(l)));
        if intl {
            keep(&|e: &Entry| e.international);
        }
        if special {
            keep(&|e: &Entry| e.code.ends_with('S'));
        }
        match pool.len() {
            1 => Some(one(pool[0], if alias.is_some() { "alias" } else { "name" }, topic, level_missing)),
            n if n > 12 && !fee_topic.is_empty() => None, // "ค่าเทอมพยาบาล": the manual's general fee answer beats a 30-programme picker
            n if n > 12 => Some(Resolution { kind: Kind::Broad, codes: codes(&pool[..6]), topic: String::new(), via: String::new(), level_missing, total: Some(n) }),
            n => Some(Resolution { kind: Kind::Many, codes: codes(&pool[..n.min(6)]), topic: topic.to_owned(), via: String::new(), level_missing, total: Some(n) }),
        }
    }
}

/// Without an apply/info intent the question must BE (almost) just a programme name: what is left after the name's pieces may not
/// exceed a quarter of the question (or 3 characters).
fn is_almost_just_a_name(needle: &Needle, best: &Entry) -> bool {
    let rest = best.name_forms.iter().map(|h| needle.text.len() as f64 * (1.0 - pieces(&needle.text, h))).fold(f64::INFINITY, f64::min);
    rest <= 3f64.max(needle.text.len() as f64 * 0.25)
}
