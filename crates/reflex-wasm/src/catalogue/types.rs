use serde::Serialize;

/// The admission schedule: `cols` = rounds, `rows` = [activity, date per round ...]. When the lines are not a clean
/// table, `cols`/`rows`/`notes` are empty and `list` holds every line as an (HTML-escaped) bullet instead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
pub struct Schedule {
    pub cols: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub notes: Vec<String>,
    pub list: Vec<String>,
}

/// One fee row of the announcement (amounts are kept as written, e.g. "50,000" or "-").
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FeeRow {
    pub grp: String,
    pub plan: String,
    pub dur: String,
    pub lump: String,
    pub res: String,
    pub visit: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
pub struct FeeTable {
    pub rows: Vec<FeeRow>,
    pub notes: Vec<String>,
}
