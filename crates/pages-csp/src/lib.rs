//! Per-page Content-Security-Policy for the static UI on Cloudflare Pages (QA F65).
//!
//! The pages run inline scripts, so `script-src` lists one SHA-256 hash per inline script. A hash changes with every edit of
//! that script, so the block in `submissions/ui/_headers` is generated, and `--check` (CI, `deploy_pages.sh`) fails when stale.

pub mod headers;
pub mod html;
pub mod policy;
pub mod run;
pub mod types;
