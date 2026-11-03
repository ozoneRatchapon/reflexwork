use serde::{Deserialize, Serialize};

/// A programme row of `programmes.json` (only the fields the resolver reads).
#[derive(Debug, Clone, Deserialize)]
pub struct Programme {
    pub code: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub title_en: Option<String>,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub announcement: Option<Announcement>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Announcement {
    #[serde(default)]
    pub title_en: Option<String>,
}

/// How many programmes the question points at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// Exactly one: show its card.
    One,
    /// A few: let the user pick.
    Many,
    /// A field word that names too many programmes (more than 12): ask for more.
    Broad,
}

/// What the page needs from a match: codes (the page maps them back to its rows) and how it was read.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub kind: Kind,
    pub codes: Vec<String>,
    pub topic: String,
    pub via: String,
    pub level_missing: bool,
    pub total: Option<usize>,
}
