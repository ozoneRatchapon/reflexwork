//! Domain pack gate runner (plan 012, step 2).
//!
//! One command runs gates 1-5 for a named pack and writes a numbered result file
//! under `benchmark/gates/`. A gate that cannot run is reported as `Skipped`, and a
//! pack is accepted only when every gate is `Pass`.

pub mod args;
pub mod numbering;
pub mod report;
pub mod runner;
pub mod scan;
pub mod types;
