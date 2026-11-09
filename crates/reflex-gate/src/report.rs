use crate::types::{GateOutcome, GateStatus};

/// Markdown result file: one row per gate, then the verdict. A pack is accepted only when every gate passes.
pub fn render(pack: &str, date: &str, outcomes: &[GateOutcome]) -> String {
    let mut out = format!("# Gate result: {pack} ({date})\n\n");
    out.push_str("| gate | status | detail |\n|---|---|---|\n");
    for o in outcomes {
        out.push_str(&format!("| {} | {} | {} |\n", o.gate.key(), o.status.label(), escape_cell(&o.detail)));
    }
    let accepted = outcomes.iter().all(|o| o.status == GateStatus::Pass);
    let verdict = match accepted {
        true => "ACCEPTED: every gate passed.",
        false => "NOT ACCEPTED: at least one gate is failed or skipped.",
    };
    out.push_str(&format!("\n**Verdict:** {verdict}\n"));
    out
}

/// Keeps a detail on one table row: pipes and newlines would break the markdown.
fn escape_cell(text: &str) -> String {
    text.replace('|', "\\|").replace('\n', " ⏎ ")
}
