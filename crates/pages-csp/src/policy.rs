//! Which policy each shipped page gets, and the CSP text built from it.

use crate::types::{Backend, PagePolicy};

pub const KERNEL: &str = "https://reflexwork-kernel.solana-thailand.workers.dev";
pub const LLM_PROXY: &str = "https://reflexwork-llm-proxy.solana-thailand.workers.dev";
/// `?api=` / `?llm=` accept loopback for local mocks (QA F10; chatbot.html `_BACKEND_OK`). CSP3: an `http:` source also matches https.
pub const LOOPBACK: [&str; 2] = ["http://127.0.0.1:*", "http://localhost:*"];

/// Every HTML file under `submissions/ui`. A new page fails the tool until it is listed here.
pub const PAGES: &[PagePolicy] = &[
    PagePolicy { file: "chatbot.html", wasm: true, backend: Backend::KernelAndLlm, deny_framing: false },
    PagePolicy { file: "dashboard.html", wasm: false, backend: Backend::Kernel, deny_framing: true },
    PagePolicy { file: "try.html", wasm: true, backend: Backend::SameOrigin, deny_framing: false },
    PagePolicy { file: "student-desk.html", wasm: true, backend: Backend::SameOrigin, deny_framing: false },
    PagePolicy { file: "how-it-works.html", wasm: false, backend: Backend::SameOrigin, deny_framing: false },
    PagePolicy { file: "pitch.html", wasm: false, backend: Backend::SameOrigin, deny_framing: false },
    PagePolicy { file: "index.html", wasm: false, backend: Backend::SameOrigin, deny_framing: false },
    PagePolicy { file: "slides.html", wasm: false, backend: Backend::SameOrigin, deny_framing: false },
];

pub fn find(file: &str) -> Option<&'static PagePolicy> {
    PAGES.iter().find(|p| p.file == file)
}

/// The URL paths Cloudflare Pages serves the file at (pretty URLs drop `.html`; `index.html` is `/`).
pub fn routes(file: &str) -> Vec<String> {
    match file.strip_suffix(".html") {
        Some("index") => vec!["/".to_string(), "/index.html".to_string()],
        Some(stem) => vec![format!("/{stem}.html"), format!("/{stem}")],
        None => vec![format!("/{file}")],
    }
}

/// The full policy for one page. `hashes` are the page's inline script hash sources.
///
/// - `style-src 'unsafe-inline'`: the pages use hundreds of `style=""` attributes; style injection is far less dangerous than script.
/// - `frame-ancestors` is set only where framing must be refused, so other pages can still be embedded by an agency.
pub fn csp(page: &PagePolicy, hashes: &[String]) -> String {
    let mut script = vec!["'self'".to_string()];
    if page.wasm {
        script.push("'wasm-unsafe-eval'".to_string());
    }
    script.extend(hashes.iter().cloned());
    if hashes.is_empty() && !page.wasm {
        script = vec!["'none'".to_string()];
    }

    let mut connect = vec!["'self'"];
    match page.backend {
        Backend::SameOrigin => {}
        Backend::Kernel => connect.extend([KERNEL].iter().chain(LOOPBACK.iter())),
        Backend::KernelAndLlm => connect.extend([KERNEL, LLM_PROXY].iter().chain(LOOPBACK.iter())),
    }

    let mut parts = vec![
        "default-src 'self'".to_string(),
        format!("script-src {}", script.join(" ")),
        "style-src 'self' 'unsafe-inline'".to_string(),
        "img-src 'self' data:".to_string(),
        format!("connect-src {}", connect.join(" ")),
        "object-src 'none'".to_string(),
        "base-uri 'none'".to_string(),
        "form-action 'none'".to_string(),
    ];
    if page.deny_framing {
        parts.push("frame-ancestors 'none'".to_string());
    }
    parts.join("; ")
}
