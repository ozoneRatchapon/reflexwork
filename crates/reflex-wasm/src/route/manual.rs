//! The manual as the decision order sees it: entries (id, title, search keywords, whether a staff member wrote it) and a search over them.
//! The search is `crate::kb_rank` - the same TF-IDF ranking `kb_search` runs in the browser.
use crate::{kb_rank, KbEntryIn, KbHit};

#[derive(Clone, Debug)]
pub struct ManualEntry {
    pub id: String,
    pub title: String,
    pub keywords: String,
    /// A live staff answer (never in the published index; the page adds them at run time).
    pub staff: bool,
    pub category: String,
    /// the answer text as served (dates are read from it)
    pub answer: String,
    /// `academic_year` / `semester` tags of a dated entry
    pub academic_year: Option<String>,
    pub semester: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Manual {
    entries: Vec<ManualEntry>,
}

/// One ranked hit with the entry it points at.
#[derive(Clone, Debug)]
pub struct Found<'a> {
    pub entry: &'a ManualEntry,
    pub hit: KbHit,
}

impl Manual {
    pub fn new(entries: Vec<ManualEntry>) -> Self {
        Manual { entries }
    }

    pub fn entries(&self) -> &[ManualEntry] {
        &self.entries
    }

    /// `search(q)` of the page: ranked entries with the gate score (`s`), cosine and overlap.
    pub fn search(&self, q: &str) -> Vec<Found<'_>> {
        let kb: Vec<KbEntryIn> = self.entries.iter().map(|e| KbEntryIn { id: e.id.clone(), keywords: e.keywords.clone() }).collect();
        kb_rank(&kb, q)
            .into_iter()
            .filter_map(|hit| self.entries.iter().find(|e| e.id == hit.id).map(|entry| Found { entry, hit }))
            .collect()
    }
}

/// Deployment settings the branches read (the page's `AGENCY`).
#[derive(Clone, Copy, Debug)]
pub struct Config {
    /// `AGENCY.it`: this deployment has an IT contact, so the "can't log in" area is offered even when the manual has no entry for it.
    pub agency_has_it: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config { agency_has_it: true }   // the Graduate School's own deployment
    }
}

/// State of the programme catalogue (the page's `PROG_STATE`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProgState {
    /// loaded and usable
    Ok,
    /// still loading
    Loading,
    /// failed to load (this deployment ships a catalogue)
    Failed,
    /// this deployment has no catalogue (another agency's pack): programme branches are off
    None,
}

/// Everything a decision reads besides the typed text.
pub struct Ctx<'a> {
    /// the user tapped a topic chip (it skips the personal / stuck / programme paths)
    pub pinned: bool,
    pub prog_state: ProgState,
    /// the programme the last card was about (`PCTX`), if any: follow-up questions refer to it
    pub programme_in_focus: Option<String>,
    /// today's date, `YYYY-MM-DD` (the Asia/Bangkok day), supplied by the caller: the decision never reads a clock
    pub today: String,
    /// the programme catalogue, when this deployment has one and it is loaded (`prog_state == Ok`)
    pub catalogue: Option<&'a crate::resolve::Catalogue>,
    pub manual: &'a Manual,
    pub config: Config,
}
