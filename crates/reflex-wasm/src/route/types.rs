//! The branches of the chat's decision order (`_askCore` in chatbot.html). One variant per `data-route` name the page stamps on a bubble;
//! the names are the contract recorded in benchmark/golden/route.json, so they must not change without re-recording it.

macro_rules! routes {
    ($($variant:ident => $name:literal,)+) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
        pub enum Route { $($variant,)+ }
        impl Route {
            pub const ALL: &'static [Route] = &[$(Route::$variant,)+];
            pub fn name(self) -> &'static str { match self { $(Route::$variant => $name,)+ } }
            pub fn from_name(s: &str) -> Option<Route> { match s { $($name => Some(Route::$variant),)+ _ => None } }
        }
    };
}

// In the order the page tries them (first match wins).
routes! {
    Wellbeing => "wellbeing",
    Smalltalk => "smalltalk",
    Personal => "personal",
    StuckPick => "stuck_pick",
    Restart => "restart",
    Overview => "overview",
    CatalogueNotReady => "catalogue_not_ready",
    GenericFee => "generic_fee",
    ProgrammeCard => "programme_card",
    ProgrammePick => "programme_pick",
    FieldFee => "field_fee",
    FreeStudy => "free_study",
    Career => "career",
    Finder => "finder",
    Followup => "followup",
    FreeFee => "free_fee",
    TimeIntent => "time_intent",
    ScopeAsk => "scope_ask",
    ScopeNoRound => "scope_no_round",
    ScopeNoYear => "scope_no_year",
    AdviceAbstain => "advice_abstain",
    AdviceStrong => "advice_strong",
    AdviceHybrid => "advice_hybrid",
    KbAct => "kb_act",
    Disambiguate => "disambiguate",
    NotAQuestion => "not_a_question",
    OtherScript => "other_script",
    EnglishOffCorpus => "english_off_corpus",
    Intake => "intake",
    UnsureProgramme => "unsure_programme",
    TuitionFinderNomatch => "tuition_finder_nomatch",
    TopicPicks => "topic_picks",
    UnderstoodByAi => "understood_by_ai",
    NotFound => "not_found",
}
