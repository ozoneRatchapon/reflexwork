//! Decoupled data types: what a page may load, and what the scan found in it.

use std::fmt;

/// Where a page may send `fetch` requests (CSP `connect-src`), beyond its own origin.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backend {
    /// Only the page's own origin (static JSON, the wasm file).
    SameOrigin,
    /// The kernel worker (live KB, gap log, feedback, staff endpoints).
    Kernel,
    /// The kernel worker and the LLM proxy worker.
    KernelAndLlm,
}

/// What one HTML page needs from the policy.
#[derive(Clone, Copy, Debug)]
pub struct PagePolicy {
    /// File name under `submissions/ui`, e.g. `chatbot.html`.
    pub file: &'static str,
    /// Loads the Reflex Kernel wasm (`WebAssembly.instantiateStreaming` needs `'wasm-unsafe-eval'`).
    pub wasm: bool,
    pub backend: Backend,
    /// May never be framed by another site (the staff dashboard: approve / retract buttons).
    pub deny_framing: bool,
}

/// An inline `<script>` that runs (classic or module), and its CSP hash source.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InlineScript {
    /// 1-based line of the opening `<script` tag.
    pub line: usize,
    /// `'sha256-<base64>'`, ready to put in `script-src`.
    pub hash_source: String,
}

/// Markup the policy would block, so the page would silently lose a feature.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Blocked {
    /// `onclick="..."` and friends, in the markup or in HTML built by a script.
    InlineHandler { line: usize, attr: String },
    /// `href="javascript:..."` / `src="javascript:..."`.
    JavascriptUrl { line: usize },
    /// `<script src="https://other.site/...">`: only same-origin scripts are allowed.
    ExternalScript { line: usize, src: String },
}

impl fmt::Display for Blocked {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Blocked::InlineHandler { line, attr } => write!(f, "line {line}: inline handler `{attr}` (use addEventListener / data-act)"),
            Blocked::JavascriptUrl { line } => write!(f, "line {line}: javascript: URL"),
            Blocked::ExternalScript { line, src } => write!(f, "line {line}: script from another origin `{src}`"),
        }
    }
}

/// The scan of one page.
#[derive(Clone, Debug, Default)]
pub struct PageScan {
    pub scripts: Vec<InlineScript>,
    pub blocked: Vec<Blocked>,
}

/// Why the tool stopped.
#[derive(Debug)]
pub enum CspError {
    Io { path: String, err: std::io::Error },
    /// An HTML file with no entry in [`crate::policy::PAGES`]: every shipped page needs a decided policy.
    UnknownPage(String),
    /// A page in [`crate::policy::PAGES`] that is not in the folder (renamed or removed).
    MissingPage(String),
    Blocked { file: String, items: Vec<Blocked> },
    /// `_headers` has no generated block markers, or they are out of order.
    Markers,
    /// `--check`: the block in `_headers` is not what the pages need now.
    Stale,
}

impl fmt::Display for CspError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CspError::Io { path, err } => write!(f, "{path}: {err}"),
            CspError::UnknownPage(p) => write!(f, "{p} has no policy: add it to PAGES in crates/pages-csp/src/policy.rs"),
            CspError::MissingPage(p) => write!(f, "{p} is in PAGES but not in the folder"),
            CspError::Blocked { file, items } => {
                write!(f, "{file}: the CSP would block:")?;
                items.iter().try_for_each(|b| write!(f, "\n  {b}"))
            }
            CspError::Markers => write!(f, "_headers: generated block markers missing or out of order"),
            CspError::Stale => write!(f, "_headers is stale: an inline script changed. Run `cargo run -q -p pages-csp` and commit _headers"),
        }
    }
}

impl std::error::Error for CspError {}
