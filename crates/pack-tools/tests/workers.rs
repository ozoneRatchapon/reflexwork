//! Plan 019 items 6.4 / 6.5: an agency's LINE and kernel configs are placeholders only and import the shared worker code.

use std::path::Path;

use pack_tools::workers::{files, placeholders, relative, worker_id, Want};
use serde_json::json;

const BOTH: Want = Want { line: true, kernel: true };

fn agency() -> serde_json::Value {
    json!({"id": "college-of-music", "name": "วิทยาลัย \"ดนตรี\"", "persona": {"hello": "สวัสดี"}, "examples": [{"q": "a"}]})
}

#[test]
fn relative_paths_walk_up_then_down() {
    assert_eq!(relative(Path::new("/r/out.workers/line"), Path::new("/r/repo/integrations/line-worker/app.mjs")), "../../repo/integrations/line-worker/app.mjs");
    assert_eq!(relative(Path::new("/a/b"), Path::new("/a/b/c.mjs")), "c.mjs");
}

#[test]
fn worker_id_is_a_safe_worker_name() {
    assert_eq!(worker_id(&agency()).unwrap(), "college-of-music");
    for bad in ["", "Music", "a b", "-a", "a-", "x\"y", &"a".repeat(41)] {
        assert!(worker_id(&json!({"id": bad})).is_err(), "{bad:?}");
    }
}

#[test]
fn writes_placeholders_never_the_graduate_school_deployment() {
    let index = vec![json!({"id": "e1", "title": "t", "approval_status": "approved"})];
    let out = files(&agency(), &index, "knowledge-index.json", Path::new("/w/site.workers"), Path::new("/w/repo"), BOTH).unwrap();
    let names: Vec<String> = out.iter().map(|f| f.rel.display().to_string()).collect();
    assert_eq!(names, ["line/kb-data.mjs", "line/worker.mjs", "line/wrangler.toml", "kernel/wrangler.toml"]);
    let all: String = out.iter().map(|f| f.text.as_str()).collect();
    // the Graduate School's D1 id, account host, site and services must never be copied into another agency's config
    for gs in ["a10fb432", "solana-thailand", "reflexwork.pages.dev", "service = \"reflexwork-kernel\"", "service = \"reflexwork-llm-proxy\""] {
        assert!(!all.contains(gs), "{gs}");
    }
    assert!(out[1].text.contains("import { makeWorker } from '../../repo/integrations/line-worker/app.mjs';"));
    assert!(out[2].text.contains("name = \"reflexwork-line-college-of-music\"") && out[2].text.contains("วิทยาลัย 'ดนตรี'"));
    assert!(out[3].text.contains("main = \"../../repo/integrations/kernel-worker/worker.mjs\"") && out[3].text.contains("database_name = \"reflexwork-college-of-music\""));
    assert!(out[0].text.contains("export const LINE_VOICE"));
    assert_eq!(
        placeholders(&out),
        [
            "line/wrangler.toml: REPLACE_kernel_host",
            "line/wrangler.toml: REPLACE_llm_proxy_host",
            "line/wrangler.toml: REPLACE_site_host",
            "kernel/wrangler.toml: REPLACE_site_host",
            "kernel/wrangler.toml: REPLACE_d1_database_id",
        ]
    );
}

#[test]
fn line_only_points_at_a_kernel_still_to_make() {
    let out = files(&agency(), &[], "i.json", Path::new("/w/s.workers"), Path::new("/w/repo"), Want { line: true, kernel: false }).unwrap();
    assert_eq!(out.len(), 3);
    assert!(out[2].text.contains("--with-kernel"));
}
