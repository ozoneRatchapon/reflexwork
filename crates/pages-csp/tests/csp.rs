//! pages-csp: hashing, the scan, the generated block, and the repo's `_headers` being current.
//! Run: cargo test -p pages-csp

use pages_csp::headers::{self, BEGIN, END};
use pages_csp::html::{hash_source, scan};
use pages_csp::policy::{self, PAGES};
use pages_csp::run::{self, Args, Mode};
use pages_csp::types::{Backend, Blocked, CspError, PagePolicy};

#[test]
fn hash_matches_the_published_csp_example() {
    // MDN, Content-Security-Policy script-src: <script>alert('Hello, world.');</script>
    assert_eq!(hash_source("alert('Hello, world.');"), "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='");
}

#[test]
fn line_endings_are_normalised_like_the_html_parser() {
    assert_eq!(hash_source("a();\r\nb();\rc();"), hash_source("a();\nb();\nc();"));
}

#[test]
fn every_running_script_is_hashed_data_blocks_and_src_are_not() {
    let html = "<script>one()</script>\n<SCRIPT type=\"module\">two()</SCRIPT>\n<script type=\"application/json\">{}</script>\n<script src=\"./a.js\"></script>";
    let s = scan(html);
    assert_eq!(s.scripts.iter().map(|x| x.line).collect::<Vec<_>>(), vec![1, 2]);
    assert_eq!(s.scripts[0].hash_source, hash_source("one()"));
    assert!(s.blocked.is_empty(), "{:?}", s.blocked);
}

#[test]
fn a_comment_hides_a_script_tag() {
    assert!(scan("<!-- <script>x()</script> -->").scripts.is_empty());
}

#[test]
fn markup_handlers_and_javascript_urls_are_blocked() {
    let s = scan("<button onclick=\"go()\">x</button>\n<a href=\"javascript:void 0\">y</a>");
    assert_eq!(s.blocked, vec![Blocked::InlineHandler { line: 1, attr: "onclick".into() }, Blocked::JavascriptUrl { line: 2 }]);
}

#[test]
fn handlers_in_html_built_by_a_script_are_blocked() {
    for body in ["el.innerHTML = '<b onclick=\"x()\">'", "h += `<i onerror=${f}>`", "s = \"<a onmouseover=\\\"y\\\">\""] {
        let s = scan(&format!("<script>{body}</script>"));
        assert!(matches!(s.blocked.as_slice(), [Blocked::InlineHandler { .. }]), "{body}: {:?}", s.blocked);
    }
}

#[test]
fn property_handlers_and_prose_are_not_handlers() {
    let s = scan("<script>el.onclick = go; // typing <img onerror=...> shows text\nb.addEventListener('click', go)</script><p>the onclick attribute</p>");
    assert!(s.blocked.is_empty(), "{:?}", s.blocked);
}

#[test]
fn scripts_from_other_origins_are_blocked() {
    let s = scan("<script src=\"https://cdn.example/x.js\"></script>");
    assert!(matches!(s.blocked.as_slice(), [Blocked::ExternalScript { line: 1, .. }]));
}

#[test]
fn policy_text() {
    let chat = PagePolicy { file: "chatbot.html", wasm: true, backend: Backend::KernelAndLlm, deny_framing: false };
    let csp = policy::csp(&chat, &["'sha256-AA='".to_string()]);
    assert!(csp.contains("script-src 'self' 'wasm-unsafe-eval' 'sha256-AA='"), "{csp}");
    assert!(csp.contains(&format!("connect-src 'self' {} {} http://127.0.0.1:* http://localhost:*", policy::KERNEL, policy::LLM_PROXY)), "{csp}");
    assert!(!csp.split("; ").any(|d| d.starts_with("script-src") && d.contains("unsafe-inline")), "{csp}");
    assert!(!csp.contains("frame-ancestors"), "only pages that must refuse framing set it: {csp}");

    let still = PagePolicy { file: "index.html", wasm: false, backend: Backend::SameOrigin, deny_framing: true };
    let csp = policy::csp(&still, &[]);
    assert!(csp.contains("script-src 'none'") && csp.contains("connect-src 'self';") && csp.ends_with("frame-ancestors 'none'"), "{csp}");
}

#[test]
fn routes_cover_pretty_urls() {
    assert_eq!(policy::routes("chatbot.html"), vec!["/chatbot.html", "/chatbot"]);
    assert_eq!(policy::routes("index.html"), vec!["/", "/index.html"]);
}

#[test]
fn splice_replaces_only_the_generated_block() {
    let file = format!("/*\n  A: b\n\n{BEGIN}\nold\n{END}\n# tail\n");
    let out = headers::splice(&file, &format!("{BEGIN}\nnew\n{END}")).expect("markers");
    assert_eq!(out, format!("/*\n  A: b\n\n{BEGIN}\nnew\n{END}\n# tail\n"));
    assert!(matches!(headers::splice("no markers", "x"), Err(CspError::Markers)));
}

#[test]
fn every_page_has_a_policy_and_no_script_needs_unsafe_inline() {
    let ui = run::default_ui();
    for page in PAGES {
        let text = std::fs::read_to_string(ui.join(page.file)).expect("page exists");
        let s = scan(&text);
        assert!(s.blocked.is_empty(), "{}: {:?}", page.file, s.blocked);
    }
}

/// The repo's `_headers` matches the pages as they are now. Fails after an inline script edit until
/// `cargo run -q -p pages-csp` is run and `_headers` committed (a stale hash would stop that script on production).
#[test]
fn repo_headers_are_current() {
    let args = Args { mode: Mode::Check, ui: run::default_ui() };
    if let Err(err) = run::run(&args) {
        panic!("{err}");
    }
}
