/// The gates a pack must pass (plan 012, "Gate set"). Gate 3 is two checks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateId {
    RouteGolden,
    WasmGolden,
    CargoTest,
    ChatE2e,
    SynthEval,
    EngineGeneric,
}

impl GateId {
    pub const ALL: [GateId; 6] = [
        GateId::RouteGolden,
        GateId::WasmGolden,
        GateId::CargoTest,
        GateId::ChatE2e,
        GateId::SynthEval,
        GateId::EngineGeneric,
    ];

    pub fn key(self) -> &'static str {
        match self {
            GateId::RouteGolden => "1 route_golden",
            GateId::WasmGolden => "2 wasm_golden",
            GateId::CargoTest => "3a cargo_test",
            GateId::ChatE2e => "3b chat_e2e",
            GateId::SynthEval => "4 synth_eval",
            GateId::EngineGeneric => "5 engine_generic",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateStatus {
    Pass,
    Fail,
    /// Not run, because the check cannot run yet. Counts as not passing.
    Skipped,
}

impl GateStatus {
    pub fn label(self) -> &'static str {
        match self {
            GateStatus::Pass => "PASS",
            GateStatus::Fail => "FAIL",
            GateStatus::Skipped => "SKIPPED",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateOutcome {
    pub gate: GateId,
    pub status: GateStatus,
    pub detail: String,
}

impl GateOutcome {
    pub fn new(gate: GateId, status: GateStatus, detail: impl Into<String>) -> Self {
        Self { gate, status, detail: detail.into() }
    }
}
