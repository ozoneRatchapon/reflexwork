//! The static review page: every entry with its title, answer, source, `valid_to` and status. The owner ticks entries to
//! approve and downloads one patch; nothing leaves the browser (no fetch, no form post, no external script or font).

use crate::answer::{body_start, lost_paragraphs, Lost, Why, ANSWER_CAP};
use crate::dates::{civil_from_days, validity};
use crate::patch::approve_patch;
use crate::types::{Entry, Status, Validity};

/// Days before `valid_to` that an entry shows as ending soon (plan 019 item 4.2 uses the same window).
pub const SOON_DAYS: i64 = 7;

/// What the page is built from.
pub struct ReviewInput<'a> {
    pub agency_name: &'a str,
    pub entries: &'a [Entry],
    /// Path of the pack's `knowledge/` folder relative to the repository root, used in the patch.
    pub path_prefix: &'a str,
    /// Today as a day number (see [`crate::dates::today`]).
    pub today: i64,
}

pub fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// JSON that is safe inside `<script type="application/json">`: `<` only occurs inside strings, so `<` is equivalent.
fn script_json(value: &serde_json::Value) -> String {
    value.to_string().replace('<', "\\u003c")
}

fn source_html(e: &Entry) -> String {
    let name = if e.source_name.is_empty() { &e.source_url } else { &e.source_name };
    match e.source_url.starts_with("https://") || e.source_url.starts_with("http://") {
        true => format!(
            "<a href=\"{}\" target=\"_blank\" rel=\"noopener noreferrer\">{}</a>",
            escape_html(&e.source_url),
            escape_html(name)
        ),
        false if name.is_empty() => "<span class=\"warn\">ไม่มีแหล่งที่มา (no source)</span>".to_string(),
        false => escape_html(name),
    }
}

fn validity_label(v: Validity) -> &'static str {
    match v {
        Validity::Unknown => "ไม่ระบุวันหมดอายุ",
        Validity::Current => "ยังใช้ได้",
        Validity::EndingSoon => "ใกล้หมดอายุ",
        Validity::Expired => "หมดอายุแล้ว",
    }
}

/// The body as written, with each paragraph the chat never shows wrapped in `<span class="lost">` (same rules as pack-lint's
/// `UnservedParagraphs` / `CappedSections`, so the owner sees on the page what the CLI warns about).
fn body_html(e: &Entry, lost: &[Lost]) -> String {
    let Some(start) = body_start(&e.lines) else { return escape_html(&e.body) };
    let rows: Vec<(usize, &str)> = e.lines.iter().enumerate().skip(start).map(|(i, l)| (i + 1, l.as_str())).collect();
    let first = rows.iter().position(|r| !r.1.trim().is_empty()).unwrap_or(rows.len());
    let last = rows.iter().rposition(|r| !r.1.trim().is_empty()).map_or(first, |i| i + 1);
    let mut out: Vec<String> = Vec::with_capacity(last.saturating_sub(first));
    for &(n, l) in &rows[first..last] {
        let opens = lost.iter().any(|p| p.first == n);
        let closes = lost.iter().any(|p| p.last == n);
        let text = escape_html(l);
        out.push(match (opens, closes) {
            (true, true) => format!("<span class=\"lost\">{text}</span>"),
            (true, false) => format!("<span class=\"lost\">{text}"),
            (false, true) => format!("{text}</span>"),
            (false, false) => text,
        });
    }
    out.join("\n")
}

fn lost_html(lost: &[Lost]) -> String {
    let n = |why: Why| lost.iter().filter(|l| l.why == why).count();
    let why = match (n(Why::OneSection), n(Why::OverCap)) {
        (0, 0) => return String::new(),
        (one, 0) => format!("{one} ย่อหน้า: หัวข้อเดียวแสดงแค่ย่อหน้าแรก ให้รวมเป็นย่อหน้าเดียว (one section serves only its first paragraph: join them)"),
        (0, cap) => format!("{cap} ย่อหน้า: คำตอบยาวเกิน {ANSWER_CAP} ตัวอักษร ให้ย่อหัวข้อก่อนหน้าหรือแยกรายการ (the answer stops at {ANSWER_CAP} characters: shorten or split)"),
        (one, cap) => format!("{} ย่อหน้า (one section: {one}, past {ANSWER_CAP} characters: {cap})", one + cap),
    };
    format!("<dt>แชทไม่แสดง</dt><dd class=\"warn\">{why} · ขีดเส้นไว้ด้านล่าง</dd>")
}

fn entry_html(i: usize, e: &Entry, has_patch: bool, today: i64) -> String {
    let lost = lost_paragraphs(&e.lines);
    let v = validity(e.valid_to.as_deref(), today, SOON_DAYS);
    let status_class = match e.status {
        Status::Approved => "approved",
        _ => "pending",
    };
    let tick = match (has_patch, &e.status) {
        (true, _) => format!("<label class=\"tick\"><input type=\"checkbox\" data-i=\"{i}\"> อนุมัติ (approve)</label>"),
        (false, Status::Approved) => "<span class=\"tick done\">อนุมัติแล้ว</span>".to_string(),
        (false, _) => "<span class=\"tick warn\">ไม่มีบรรทัด approval_status ให้แก้</span>".to_string(),
    };
    format!(
        "<article class=\"entry {status_class}\" data-status=\"{status_class}\">\n<header><h2>{title}</h2>{tick}</header>\n\
<dl><dt>ไฟล์</dt><dd><code>{file}</code></dd><dt>สถานะ</dt><dd class=\"st\">{status}</dd>\
<dt>ใช้ได้ถึง</dt><dd class=\"v-{vclass}\">{valid_to} · {vlabel}</dd><dt>แหล่งที่มา</dt><dd>{source}</dd>\
<dt>หมวด / ภาษา</dt><dd>{category} / {language}</dd>{lost_dd}</dl>\n<pre class=\"body\">{body}</pre>\n</article>\n",
        title = escape_html(if e.title.is_empty() { "(ไม่มี title)" } else { &e.title }),
        file = escape_html(&e.file_name),
        status = escape_html(e.status.label()),
        vclass = v.class(),
        valid_to = escape_html(e.valid_to.as_deref().unwrap_or("-")),
        vlabel = validity_label(v),
        source = source_html(e),
        category = escape_html(&e.category),
        language = escape_html(&e.language),
        lost_dd = lost_html(&lost),
        body = body_html(e, &lost),
    )
}

const STYLE: &str = "body{font:16px/1.6 system-ui,sans-serif;margin:0 auto;max-width:60rem;padding:1rem;color:#1b1b1b}\
header.top{position:sticky;top:0;background:#fff;border-bottom:1px solid #ccc;padding:.5rem 0;z-index:1}\
.entry{border:1px solid #ccc;border-radius:.5rem;padding:.75rem 1rem;margin:1rem 0}.entry.approved{border-color:#2e7d32}\
.entry header{display:flex;gap:1rem;justify-content:space-between;align-items:flex-start}h2{font-size:1.1rem;margin:0}\
dl{display:grid;grid-template-columns:max-content 1fr;gap:.1rem .75rem;margin:.5rem 0}dt{color:#555}dd{margin:0}\
pre.body{white-space:pre-wrap;font:inherit;background:#f6f6f6;padding:.5rem;border-radius:.25rem;margin:0}\
.v-expired,.warn{color:#b00020;font-weight:600}.v-soon{color:#8a5a00;font-weight:600}.tick{white-space:nowrap}.done{color:#2e7d32}\
.lost{background:#fdecea;text-decoration:underline wavy #b00020}\
textarea{width:100%;height:10rem;font:13px ui-monospace,monospace}button{font:inherit;padding:.3rem .8rem}";

/// The page script: count the ticks, join their patches in page order, offer them as a download and as text to copy.
const SCRIPT: &str = r#"(() => {
  const patches = JSON.parse(document.getElementById('patches').textContent);
  const boxes = [...document.querySelectorAll('input[type=checkbox][data-i]')];
  const out = document.getElementById('patch'), count = document.getElementById('count'), dl = document.getElementById('download');
  const render = () => {
    const picked = boxes.filter(b => b.checked).map(b => patches[b.dataset.i]);
    count.textContent = String(picked.length);
    out.value = picked.join('');
    dl.disabled = !picked.length;
  };
  boxes.forEach(b => b.addEventListener('change', render));
  document.getElementById('all').addEventListener('click', () => { boxes.forEach(b => { b.checked = true; }); render(); });
  document.getElementById('none').addEventListener('click', () => { boxes.forEach(b => { b.checked = false; }); render(); });
  document.getElementById('pending-only').addEventListener('change', e => {
    document.querySelectorAll('.entry.approved').forEach(a => { a.hidden = e.target.checked; });
  });
  dl.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([out.value], { type: 'text/x-diff' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'approve.patch' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  render();
})();"#;

/// The whole page as one self-contained HTML file.
pub fn render(input: &ReviewInput) -> String {
    let patches: Vec<Option<String>> = input.entries.iter().map(|e| approve_patch(e, input.path_prefix)).collect();
    let pending = input.entries.iter().filter(|e| e.status != Status::Approved).count();
    let expired = input
        .entries
        .iter()
        .filter(|e| validity(e.valid_to.as_deref(), input.today, SOON_DAYS) == Validity::Expired)
        .count();
    let dropping = input.entries.iter().filter(|e| !lost_paragraphs(&e.lines).is_empty()).count();
    let body: String = input
        .entries
        .iter()
        .zip(&patches)
        .enumerate()
        .map(|(i, (e, p))| entry_html(i, e, p.is_some(), input.today))
        .collect();
    let json = serde_json::Value::Array(
        patches.into_iter().map(|p| p.map_or(serde_json::Value::Null, serde_json::Value::String)).collect(),
    );
    let name = escape_html(input.agency_name);
    let today = civil_from_days(input.today);
    let total = input.entries.len();
    format!(
        "<!doctype html>\n<html lang=\"th\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n\
<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'\">\n\
<title>ตรวจและอนุมัติคำตอบ · {name}</title>\n<style>{STYLE}</style>\n</head>\n<body>\n\
<header class=\"top\">\n<h1>ตรวจและอนุมัติคำตอบ · {name}</h1>\n\
<p>{total} รายการ · รออนุมัติ {pending} · หมดอายุแล้ว {expired} · แชทไม่แสดงบางย่อหน้า {dropping} · ตรวจเมื่อ {today}. หน้านี้ไม่ส่งข้อมูลออกไปไหน (nothing leaves this browser).</p>\n\
<p><button id=\"all\" type=\"button\">เลือกทั้งหมด</button> <button id=\"none\" type=\"button\">ไม่เลือก</button> \
<label><input id=\"pending-only\" type=\"checkbox\"> แสดงเฉพาะที่รออนุมัติ</label> · เลือกแล้ว <b id=\"count\">0</b> \
<button id=\"download\" type=\"button\" disabled>ดาวน์โหลด approve.patch</button></p>\n\
<details><summary>patch (คัดลอกได้) · ให้ทีมพัฒนารัน <code>git apply approve.patch</code> ที่ราก repository</summary>\
<textarea id=\"patch\" readonly aria-label=\"approve.patch\"></textarea></details>\n</header>\n<main>\n{body}</main>\n\
<script type=\"application/json\" id=\"patches\">{patches}</script>\n<script>{SCRIPT}</script>\n</body>\n</html>\n",
        patches = script_json(&json),
    )
}
