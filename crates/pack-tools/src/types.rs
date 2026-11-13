//! Plain data shared by the pack tools.

/// Where an entry stands in the owner's approval: only `Approved` is published by a normal build.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Status {
    Approved,
    Draft,
    /// Any other value (`pending_owner_approval`, a typo, ...): never published, shown as written.
    Other(String),
    /// No `approval_status` line at all.
    Missing,
}

impl Status {
    pub fn parse(raw: Option<&str>) -> Self {
        match raw {
            None => Status::Missing,
            Some("approved") => Status::Approved,
            Some("draft") => Status::Draft,
            Some(other) => Status::Other(other.to_string()),
        }
    }

    pub fn label(&self) -> &str {
        match self {
            Status::Approved => "approved",
            Status::Draft => "draft",
            Status::Other(s) => s,
            Status::Missing => "(no approval_status)",
        }
    }
}

/// How an entry's `valid_to` compares with today.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Validity {
    /// No `valid_to`, or a value that is not `YYYY-MM-DD`.
    Unknown,
    Current,
    /// Ends within the warning window (today counts).
    EndingSoon,
    Expired,
}

impl Validity {
    pub fn class(self) -> &'static str {
        match self {
            Validity::Unknown => "unknown",
            Validity::Current => "current",
            Validity::EndingSoon => "soon",
            Validity::Expired => "expired",
        }
    }
}

/// One knowledge entry (`knowledge/*.md`) as the owner reviews it.
#[derive(Debug, Clone)]
pub struct Entry {
    /// File name inside `knowledge/`, e.g. `music_round_1.md`.
    pub file_name: String,
    pub title: String,
    pub category: String,
    pub source_name: String,
    pub source_url: String,
    pub language: String,
    pub valid_to: Option<String>,
    pub status: Status,
    /// Text after the frontmatter, as written.
    pub body: String,
    /// The file's lines without their `\n`, for building a patch.
    pub lines: Vec<String>,
    /// Whether the file ends with `\n` (a patch must say so when it touches the last line).
    pub trailing_newline: bool,
    /// Index into `lines` of the `approval_status:` line, if any.
    pub status_line: Option<usize>,
}
