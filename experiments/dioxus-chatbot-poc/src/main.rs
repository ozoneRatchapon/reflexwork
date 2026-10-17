// Dioxus chatbot PoC — does the ReflexWork chatbot UI port cleanly to Rust?
// This renders the real shell: header, kernel-decision strip, message list, the
// ask row, and a smalltalk/FastPath reply — all as typed Rust components with
// reactive state (signals). It proves the UI layer works in Dioxus following the
// karaoke pattern (dx build -> dist/ -> wrangler assets). The decision logic here
// is a trimmed inline mirror of reflex-wasm so the PoC builds standalone; the
// real app would call the crate's kb_search/classify_smalltalk directly (one
// Rust codebase, no JS/Rust drift — the whole point of #1).
use dioxus::prelude::*;

fn main() {
    dioxus::launch(App);
}

#[derive(Clone, PartialEq)]
struct Msg {
    user: bool,
    text: String,
    route: Option<String>, // Some("FastPath") etc. for bot kernel strip
    us: u32,
}

#[component]
fn App() -> Element {
    let mut input = use_signal(String::new);
    let mut msgs = use_signal(Vec::<Msg>::new);

    let mut ask = move || {
        let q = input().trim().to_string();
        if q.is_empty() { return; }
        msgs.write().push(Msg { user: true, text: q.clone(), route: None, us: 0 });
        input.set(String::new());
        // smalltalk first (mirror of reflex-wasm::classify_smalltalk, trimmed)
        let kind = classify(&q);
        if !kind.is_empty() {
            msgs.write().push(Msg { user: false, text: reply(&kind), route: None, us: 0 });
            return;
        }
        // else: pretend kernel FastPath (the real app calls route_task / kb_search)
        msgs.write().push(Msg {
            user: false,
            text: format!("(kernel จะตอบจากคู่มือ — PoC) สำหรับ: {q}"),
            route: Some("FastPath".into()),
            us: 2700,
        });
    };

    rsx! {
        style { {CSS} }
        nav { class: "nav", span { "🦀 ReflexWork · Dioxus PoC" } }
        div { class: "top",
            div { class: "org", "บัณฑิตวิทยาลัย มหาวิทยาลัยมหิดล · ผู้ช่วยตอบคำถาม (Dioxus)" }
            h1 { "ถาม-ตอบ (Rust/WASM UI)" }
        }
        div { class: "wrap",
            div { class: "chat",
                if msgs().is_empty() {
                    div { class: "greet", "สวัสดีครับ 🦀 ลองพิมพ์: สวัสดี / ค่าสอบเท่าไร" }
                }
                for m in msgs() {
                    div { class: if m.user { "msg u" } else { "msg b" },
                        if let Some(r) = m.route.clone() {
                            div { class: "kstrip",
                                span { class: "kbadge", "kernel: {r}" }
                                span { class: "km", "⚡ {m.us} µs" }
                                span { class: "km", "💰 0 token" }
                            }
                        }
                        div { "{m.text}" }
                    }
                }
            }
            div { class: "ask",
                input {
                    value: "{input}",
                    placeholder: "เช่น ค่าสอบเท่าไร",
                    oninput: move |e| input.set(e.value()),
                    onkeydown: move |e| if e.key() == Key::Enter { ask(); },
                }
                button { onclick: move |_| ask(), "ถาม" }
            }
        }
    }
}

// trimmed mirror of reflex-wasm::classify_smalltalk (the real app imports it)
fn classify(q: &str) -> String {
    let l = q.to_lowercase();
    let is_q = ["กี่", "เท่าไร", "ยังไง", "วิธี", "สอบ", "ค่า", "?"].iter().any(|p| q.contains(p));
    if is_q { return String::new(); }
    if l.starts_with("สวัสดี") || l.starts_with("hello") || l.starts_with("hi") { return "greet".into(); }
    if q.contains("ขอบคุณ") && !q.contains("ไม่ช่วย") { return "thanks".into(); }
    String::new()
}
fn reply(kind: &str) -> String {
    match kind {
        "greet" => "สวัสดีครับ 🦀 มีเรื่องอะไรให้ช่วยไหมครับ? เล่ามาได้เลย".into(),
        "thanks" => "ยินดีครับ 🙂".into(),
        _ => "มีอะไรให้ช่วยไหมครับ?".into(),
    }
}

const CSS: &str = r#"
  body{margin:0;background:#0b1020;color:#e9edff;font-family:system-ui,sans-serif}
  .nav{background:#0b1020;border-bottom:1px solid #2a3660;padding:12px 18px;font-weight:700;color:#5b8cff}
  .top{padding:22px 18px} .top .org{color:#9fb0d8;font-size:12px} .top h1{margin:6px 0;font-size:20px}
  .wrap{max-width:720px;margin:0 auto;padding:0 16px 40px}
  .chat{background:#121a33;border:1px solid #2a3660;border-radius:14px;padding:16px;min-height:220px}
  .greet{background:rgba(34,197,139,.1);border:1px solid rgba(34,197,139,.4);border-radius:10px;padding:12px;color:#e9edff}
  .msg{margin:8px 0;padding:9px 12px;border-radius:10px;max-width:88%}
  .msg.u{background:#5b8cff;color:#07122e;margin-left:auto}
  .msg.b{background:#0b1020;border:1px solid #2a3660}
  .kstrip{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .kbadge{background:rgba(34,197,139,.16);color:#22c58b;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
  .km{background:#121a33;border:1px solid #2a3660;font-size:11px;padding:2px 8px;border-radius:999px;color:#9fb0d8}
  .ask{display:flex;gap:8px;margin-top:12px}
  .ask input{flex:1;background:#121a33;border:1px solid #2a3660;border-radius:10px;padding:11px;color:#e9edff;font-size:16px}
  .ask button{background:#5b8cff;color:#07122e;border:none;border-radius:10px;padding:11px 20px;font-weight:700;cursor:pointer}
"#;
