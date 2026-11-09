/// What a masked span was. The placeholder is what the AI, the gap list and staff see instead of the value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PiiKind {
    Email,
    NationalId,
    Phone,
    AccountId,
    LineId,
    Name,
}

impl PiiKind {
    pub fn placeholder(self) -> &'static str {
        match self {
            PiiKind::Email => "[email]",
            PiiKind::NationalId => "[national-id]",
            PiiKind::Phone => "[phone]",
            PiiKind::AccountId => "[id]",
            PiiKind::LineId => "[line]",
            PiiKind::Name => "[name]",
        }
    }
}
