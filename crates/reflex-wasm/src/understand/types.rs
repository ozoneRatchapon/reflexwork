use serde::{Deserialize, Serialize};

/// One search result for a phrase: the entry id and its score (best first).
#[derive(Debug, Clone, Deserialize)]
pub struct Hit {
    pub id: String,
    #[serde(rename = "s")]
    pub score: f64,
}

/// What the page does with the phrases.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Understood {
    /// Answer this entry (shown with how the question was read, and a way out).
    One { id: String, score: f64, via: String, others: Vec<String> },
    /// The phrases point at different entries: offer them, do not pick.
    Many { ids: Vec<String> },
    /// Nothing clear: the old "not found" reply.
    None,
}
