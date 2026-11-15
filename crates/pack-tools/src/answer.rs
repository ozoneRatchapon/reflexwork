//! Which paragraphs of an entry the chat serves, mirroring `extract_answer` in `submissions/build_knowledge_index.py`.
//! One section (a `## title`, the keyword line, then text) serves only its FIRST content paragraph; two or more `##` sections with
//! content serve every section in order until the answer would pass `ANSWER_CAP`, and the sections after that are dropped whole.
//! A pack written as several paragraphs under one heading, or as many long sections, silently loses the rest.

/// The builder's `ANSWER_CAP`: characters (Python `len`, i.e. code points) a multi-section answer may reach.
pub const ANSWER_CAP: usize = 1500;

/// The section names whose text is never served (the builder's `_SKIP_SECTIONS`: citations, notes to the bot).
const SKIP_SECTIONS: [&str; 2] = ["แหล่งอ้างอิง", "หมายเหตุ"];

/// A paragraph of the body: the 1-based file line it starts on, and its lines.
struct Paragraph<'a> {
    line: usize,
    lines: Vec<&'a str>,
}

/// Why the chat never shows a paragraph.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Why {
    /// The entry has one usable `##` section (or none): only its first content paragraph is served.
    OneSection,
    /// A multi-section answer reached `ANSWER_CAP`: this section and the ones after it are cut.
    OverCap,
}

/// A paragraph the chat never shows: 1-based file lines, `first` = its first content line, `last` = its last line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Lost {
    pub first: usize,
    pub last: usize,
    pub why: Why,
}

/// A content paragraph with the text the builder takes from it.
struct Content {
    first: usize,
    last: usize,
    text: String,
}

/// The builder's `_content_lines`: not blank, not a heading, not the keyword line.
fn is_content(line: &str) -> bool {
    let t = line.trim_start();
    !line.trim().is_empty() && !t.starts_with('#') && !t.starts_with("คำค้น")
}

/// The content of `lines` (`_content_lines`): the kept lines joined, then stripped; `None` when nothing is kept.
fn content(lines: &[&str], line: usize, last: usize) -> Option<Content> {
    let at = lines.iter().position(|l| is_content(l))?;
    let text = lines.iter().filter(|l| is_content(l)).copied().collect::<Vec<_>>().join("\n").trim().to_string();
    Some(Content { first: line + at, last, text })
}

/// The body's paragraphs (the builder splits on an empty line), with their file line numbers. `first_line` = the body's first line.
fn paragraphs<'a>(body: &[&'a str], first_line: usize) -> Vec<Paragraph<'a>> {
    let mut out: Vec<Paragraph> = Vec::new();
    let mut cur: Option<Paragraph> = None;
    for (i, l) in body.iter().enumerate() {
        match (l.is_empty(), cur.as_mut()) {
            (true, _) => out.extend(cur.take()),
            (false, Some(p)) => p.lines.push(l),
            (false, None) => cur = Some(Paragraph { line: first_line + i, lines: vec![l] }),
        }
    }
    out.extend(cur);
    out
}

/// Index into `lines` of the body's first line (the line after the closing `---`), as `entry::parse_entry` reads it.
pub fn body_start(lines: &[String]) -> Option<usize> {
    lines.iter().skip(1).position(|l| l == "---").map(|i| i + 2)
}

fn lost(c: &Content, why: Why) -> Lost {
    Lost { first: c.first, last: c.last, why }
}

/// Every content paragraph the chat never shows, in file order (empty when everything is served).
/// `lines` = the whole file (frontmatter included), as `Entry::lines`.
pub fn lost_paragraphs(lines: &[String]) -> Vec<Lost> {
    let Some(start) = body_start(lines) else { return Vec::new() };
    let body: Vec<&str> = lines[start..].iter().map(String::as_str).collect();
    // (heading, content paragraphs) per section; index 0 = the preamble (text before any `##` or after a `# title`)
    let mut sections: Vec<(Option<&str>, Vec<Content>)> = vec![(None, Vec::new())];
    let mut cur = 0;
    for p in paragraphs(&body, start + 1) {
        let first = p.lines[0].trim_start();
        let last = p.line + p.lines.len() - 1;
        match (first.strip_prefix("##"), first.starts_with('#')) {
            (Some(h), _) => {
                // the heading's own paragraph: its later lines are that section's first content
                sections.push((Some(h.trim_start_matches('#').trim()), content(&p.lines[1..], p.line + 1, last).into_iter().collect()));
                cur = sections.len() - 1;
            }
            (None, true) => cur = 0, // a `# document title`: what follows is preamble again
            (None, false) => sections[cur].1.extend(content(&p.lines, p.line, last)),
        }
    }
    let skipped = |h: &Option<&str>| h.is_some_and(|h| SKIP_SECTIONS.iter().any(|s| h.starts_with(s)));
    let usable: Vec<&(Option<&str>, Vec<Content>)> = sections.iter().filter(|s| s.0.is_some() && !skipped(&s.0) && !s.1.is_empty()).collect();
    let mut out: Vec<Lost> = match usable.len() {
        // one answer: the usable section's first paragraph, else the preamble's; everything else with content is lost
        0 | 1 => {
            let served = usable.first().copied().unwrap_or(&sections[0]).1.first().map(|c| c.first);
            let all = sections.iter().filter(|s| !skipped(&s.0)).flat_map(|s| s.1.iter());
            all.filter(|c| Some(c.first) != served).map(|c| lost(c, Why::OneSection)).collect()
        }
        _ => over_cap(&sections[0].1, &usable),
    };
    out.sort_by_key(|l| l.first);
    out
}

/// The multi-section layout: the preamble, then `▪ heading` blocks while the answer stays within `ANSWER_CAP` (the first block always
/// fits when there is no preamble). The section that would pass the cap and every one after it are lost.
fn over_cap(preamble: &[Content], usable: &[&(Option<&str>, Vec<Content>)]) -> Vec<Lost> {
    let chars = |s: &str| s.chars().count();
    let sep = chars("\n\n");
    let mut len = preamble.iter().map(|c| chars(&c.text)).sum::<usize>() + sep * preamble.len().saturating_sub(1);
    for (i, (head, paras)) in usable.iter().enumerate() {
        // "▪ " + head + "\n" + the paragraphs joined by "\n" (`_bullets` swaps "- " for "• ": same length)
        let block = 2 + chars(head.unwrap_or_default()) + 1 + paras.iter().map(|c| chars(&c.text)).sum::<usize>() + paras.len().saturating_sub(1);
        let cand = match len {
            0 => block,
            n => n + sep + block,
        };
        if len > 0 && cand > ANSWER_CAP {
            return usable[i..].iter().flat_map(|s| s.1.iter()).map(|c| lost(c, Why::OverCap)).collect();
        }
        len = cand;
    }
    Vec::new()
}

/// Content paragraphs the chat never shows for `why`: `(first such line, how many)`, or `None` when none are.
pub fn unserved(lines: &[String], why: Why) -> Option<(usize, usize)> {
    let lost: Vec<Lost> = lost_paragraphs(lines).into_iter().filter(|l| l.why == why).collect();
    lost.first().map(|l| (l.first, lost.len()))
}
