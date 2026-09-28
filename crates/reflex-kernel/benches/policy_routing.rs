//! Criterion benchmark: policy routing latency.
//!
//! Run with: cargo bench --bench policy_routing

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use reflex_kernel::{
    encoder::FeatureEncoder,
    policy::{PolicyRouter, PolicyState},
    types::{TaskCategory, TaskSpec},
};
use uuid::Uuid;

fn make_task() -> TaskSpec {
    TaskSpec {
        id: Uuid::new_v4(),
        category: TaskCategory::ComplianceCheck,
        raw_input: "Review all PDPA compliance documents for Q3 and flag violations.".into(),
        token_budget: 2048,
        deadline_unix_ns: 0,
        priority: 200,
        context_tags: vec!["compliance".into(), "pdpa".into(), "q3".into()],
        requester_pubkey: None,
        workflow_id: None,
    }
}

fn bench_encode(c: &mut Criterion) {
    let enc  = FeatureEncoder::new(64);
    let task = make_task();

    c.bench_function("feature_encode", |b| {
        b.iter(|| enc.encode(black_box(&task)).unwrap())
    });
}

fn bench_route(c: &mut Criterion) {
    let enc    = FeatureEncoder::new(64);
    let policy = PolicyState::new(64, 0.72, 0.97);
    let task   = make_task();
    let x      = enc.encode(&task).unwrap();

    c.bench_function("policy_route", |b| {
        b.iter(|| PolicyRouter::route(black_box(&x), black_box(&policy)).unwrap())
    });
}

criterion_group!(benches, bench_encode, bench_route);
criterion_main!(benches);
