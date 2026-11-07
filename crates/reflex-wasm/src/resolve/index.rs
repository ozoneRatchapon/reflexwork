use super::patterns::patterns;
use super::text::{core_of, replace_parens, replace_ws, tone, tri, u16s, Tri};
use super::types::Programme;

/// Everything the resolver derives from one programme, computed once (the page recomputes it for every question).
pub(super) struct Entry {
    pub code: String,
    /// The programme's title as the catalogue has it (`p.title`): the page's `nearSpelling` compares against this.
    pub title: String,
    pub international: bool,
    pub core: Vec<u16>,
    pub full: Vec<u16>,
    pub en: Vec<u16>,
    pub core_tri: Tri,
    pub full_tri: Tri,
    pub en_tri: Tri,
    /// The three spellings used to judge "is the question (almost) just this name": core, title and English title, tone-stripped.
    pub name_forms: Vec<Vec<u16>>,
}

impl Entry {
    /// The names a question is compared with: `[core, full, en]`, empty ones dropped (`filter(Boolean)`).
    pub fn names(&self) -> impl Iterator<Item = (&[u16], &Tri)> {
        [(&self.core, &self.core_tri), (&self.full, &self.full_tri), (&self.en, &self.en_tri)]
            .into_iter()
            .filter(|(h, _)| !h.is_empty())
            .map(|(h, t)| (h.as_slice(), t))
    }
}

fn from_programme(p: &Programme) -> Entry {
    let degree_words = &patterns().degree_words;
    let core = core_of(&p.title, degree_words);
    let full = tone(&replace_ws(&replace_parens(&p.title, ""), "").to_lowercase());
    // `(announcement.title_en) || title_en || ''`
    let en_src = [p.announcement.as_ref().and_then(|a| a.title_en.as_deref()), p.title_en.as_deref()].into_iter().flatten().find(|s| !s.is_empty()).unwrap_or("");
    let en = replace_ws(&en_src.to_lowercase(), "");
    let nk = |x: &str| tone(&replace_ws(&x.to_lowercase(), ""));
    let name_forms = [core.clone(), nk(&replace_parens(&p.title, "")), nk(en_src)].iter().filter(|s| !s.is_empty()).map(|s| u16s(s)).collect();
    Entry {
        code: p.code.clone(),
        title: p.title.clone(),
        international: p.kind == "international",
        core_tri: tri(&core),
        full_tri: tri(&full),
        en_tri: tri(&en),
        core: u16s(&core),
        full: u16s(&full),
        en: u16s(&en),
        name_forms,
    }
}

/// The programme catalogue, indexed for matching questions.
pub struct Catalogue {
    pub(super) entries: Vec<Entry>,
}

impl Catalogue {
    pub fn new(programmes: &[Programme]) -> Self {
        Self { entries: programmes.iter().map(from_programme).collect() }
    }
}
