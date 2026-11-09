//! Scan one HTML page: hash its inline scripts and find markup a hash-based CSP would block.
//!
//! This is a small scanner, not a full HTML parser. It handles what the pages under `submissions/ui` use:
//! `<!-- comments -->`, `<script ...>...</script>` (raw text, ends at the first `</script`), and attributes.

use std::sync::LazyLock;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use regex_lite::Regex;
use sha2::{Digest, Sha256};

use crate::types::{Blocked, InlineScript, PageScan};

/// `onclick=` style attributes in markup (any value form).
static MARKUP_HANDLER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)\s(on[a-z]+)\s*=\s*["'a-z0-9_$]"#).expect("valid regex"));
/// The same attribute inside HTML that a script builds (`onclick="`, `onclick=\"`, `onclick=${`).
static SCRIPT_HANDLER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)[\s"'`](on[a-z]+)=(?:["'`]|\\["']|\$\{)"#).expect("valid regex"));
/// `href="javascript:` / `src='javascript:`, in markup or in HTML a script builds.
static JS_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(?:href|src|action|formaction)\s*=\s*\\?["']?\s*javascript:"#).expect("valid regex"));

/// The CSP hash source for a script's text: SHA-256 of its UTF-8 bytes after the HTML parser's line-ending normalisation.
pub fn hash_source(text: &str) -> String {
    let normalised = text.replace("\r\n", "\n").replace('\r', "\n");
    format!("'sha256-{}'", STANDARD.encode(Sha256::digest(normalised.as_bytes())))
}

pub fn scan(html: &str) -> PageScan {
    let lower = html.to_ascii_lowercase();
    let mut out = PageScan::default();
    let mut markup_from = 0;
    let mut pos = 0;
    while pos < html.len() {
        let rest = &lower[pos..];
        let Some(rel) = rest.find('<') else { break };
        let at = pos + rel;
        let tail = &lower[at..];
        if tail.starts_with("<!--") {
            let end = tail.find("-->").map_or(html.len(), |e| at + e + 3);
            scan_markup(html, markup_from, at, &mut out);
            markup_from = end;
            pos = end;
            continue;
        }
        if !tail.starts_with("<script") || !tail[7..].starts_with(|c: char| c == '>' || c.is_ascii_whitespace()) {
            pos = at + 1;
            continue;
        }
        let Some(tag_end) = tail.find('>').map(|e| at + e) else { break };
        let body_start = tag_end + 1;
        let body_end = lower[body_start..].find("</script").map_or(html.len(), |e| body_start + e);
        scan_markup(html, markup_from, tag_end + 1, &mut out);
        let line = line_of(html, at);
        let tag = &html[at..=tag_end];
        match attr(tag, "src") {
            Some(src) if is_external(&src) => out.blocked.push(Blocked::ExternalScript { line, src }),
            Some(_) => {}
            None if runs(attr(tag, "type").as_deref()) => {
                let body = &html[body_start..body_end];
                out.scripts.push(InlineScript { line, hash_source: hash_source(body) });
                scan_script(html, body_start, body, &mut out);
            }
            None => {}
        }
        markup_from = body_end;
        pos = body_end;
    }
    scan_markup(html, markup_from, html.len(), &mut out);
    out
}

fn scan_markup(html: &str, from: usize, to: usize, out: &mut PageScan) {
    if from >= to {
        return;
    }
    let part = &html[from..to];
    for c in MARKUP_HANDLER.captures_iter(part) {
        let m = c.get(1).expect("group 1");
        out.blocked.push(Blocked::InlineHandler { line: line_of(html, from + m.start()), attr: m.as_str().to_string() });
    }
    for m in JS_URL.find_iter(part) {
        out.blocked.push(Blocked::JavascriptUrl { line: line_of(html, from + m.start()) });
    }
}

fn scan_script(html: &str, offset: usize, body: &str, out: &mut PageScan) {
    for c in SCRIPT_HANDLER.captures_iter(body) {
        let m = c.get(1).expect("group 1");
        out.blocked.push(Blocked::InlineHandler { line: line_of(html, offset + m.start()), attr: m.as_str().to_string() });
    }
    for m in JS_URL.find_iter(body) {
        out.blocked.push(Blocked::JavascriptUrl { line: line_of(html, offset + m.start()) });
    }
}

/// Script types the browser executes (and so needs a hash). `application/json`, `text/template` etc. are data blocks.
fn runs(kind: Option<&str>) -> bool {
    match kind.map(|k| k.trim().to_ascii_lowercase()) {
        None => true,
        Some(k) => matches!(k.as_str(), "" | "module" | "importmap" | "text/javascript" | "application/javascript"),
    }
}

fn is_external(src: &str) -> bool {
    let s = src.trim().to_ascii_lowercase();
    s.starts_with("http:") || s.starts_with("https:") || s.starts_with("//") || s.starts_with("data:")
}

/// The value of `name` in an opening tag (quoted or bare), if present.
fn attr(tag: &str, name: &str) -> Option<String> {
    let re = Regex::new(&format!(r#"(?i)\s{name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#)).expect("valid regex");
    re.captures(tag).and_then(|c| c.get(1).or_else(|| c.get(2)).or_else(|| c.get(3))).map(|m| m.as_str().to_string())
}

fn line_of(html: &str, at: usize) -> usize {
    html[..at].bytes().filter(|&b| b == b'\n').count() + 1
}
