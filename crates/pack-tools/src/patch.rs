//! A `git apply` patch that sets one entry's `approval_status` to `"approved"`. Each entry gets its own file diff, so the
//! review page can join the ticked ones in any order and the result still applies.

use std::fmt::Write as _;

use crate::types::{Entry, Status};

/// Lines of context on each side of the change (git's default).
const CONTEXT: usize = 3;

/// The approved form of a status line (quoted, like every other frontmatter value).
const APPROVED_LINE: &str = "approval_status: \"approved\"";

/// The file diff that approves `entry`, with paths as `<prefix>/<file_name>` (prefix relative to the repository root).
/// `None` when there is nothing to change: already approved, or no `approval_status` line to flip.
pub fn approve_patch(entry: &Entry, prefix: &str) -> Option<String> {
    if entry.status == Status::Approved {
        return None;
    }
    let at = entry.status_line?;
    let n = entry.lines.len();
    // A context line that is the file's last line would need a "\ No newline at end of file" marker; stop one line short.
    let last_usable = if entry.trailing_newline { n } else { n - 1 };
    let start = at.saturating_sub(CONTEXT);
    let end = (at + 1 + CONTEXT).min(last_usable).max(at + 1);
    let path = if prefix.is_empty() { entry.file_name.clone() } else { format!("{}/{}", prefix.trim_end_matches('/'), entry.file_name) };
    let len = end - start;
    let mut out = format!("diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -{},{len} +{},{len} @@\n", start + 1, start + 1);
    for (i, line) in entry.lines.iter().enumerate().take(end).skip(start) {
        // the status line sits inside the frontmatter, so the closing `---` follows it: it is never the file's last line
        match i == at {
            true => { let _ = write!(out, "-{line}\n+{APPROVED_LINE}\n"); }
            false => { let _ = writeln!(out, " {line}"); }
        }
    }
    Some(out)
}
