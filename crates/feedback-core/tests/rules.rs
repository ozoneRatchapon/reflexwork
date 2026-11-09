use feedback_core::effect::{day_of, fix_effect, MIN_VOTES};
use feedback_core::queue::fix_queue;
use feedback_core::types::{DayVotes, EffectVerdict, EntryFeedback, Reason, ReasonCounts};

#[test]
fn reasons_are_a_strict_enum() {
    for r in Reason::ALL {
        assert_eq!(Reason::parse(r.code()), Some(r));
    }
    for bad in ["", "WRONG", "wrong ", "other", "ตอบผิด", "wrong;drop table"] {
        assert_eq!(Reason::parse(bad), None, "{bad:?}");
    }
}

fn row(id: &str, up: u32, down: u32, wrong: u32, outdated: u32) -> EntryFeedback {
    EntryFeedback { id: id.into(), up, down, reasons: ReasonCounts { wrong, outdated, ..Default::default() }, last_fix_at: None }
}

#[test]
fn queue_orders_by_down_then_reasons_then_id_and_drops_clean_entries() {
    let q = fix_queue(&[row("c", 9, 0, 0, 0), row("b", 0, 3, 1, 0), row("a", 0, 3, 1, 0), row("d", 1, 3, 2, 1), row("e", 0, 5, 0, 0)]);
    let ids: Vec<&str> = q.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(ids, ["e", "d", "a", "b"], "c has no 👎 and no reason: not in the queue");
    assert_eq!(q[1].reason_total, 3);
    assert_eq!(q[1].top_reason, Some(Reason::Wrong));
    assert_eq!(q[0].top_reason, None);
}

#[test]
fn top_reason_ties_go_to_the_enum_order() {
    let c = ReasonCounts { wrong: 0, off_topic: 2, outdated: 2, incomplete: 1 };
    assert_eq!(c.top(), Some(Reason::OffTopic));
}

#[test]
fn fix_effect_leaves_out_the_fix_day_and_refuses_small_samples() {
    let fixed = 20_000;
    let days = [DayVotes { day: fixed - 2, up: 2, down: 8 }, DayVotes { day: fixed - 1, up: 0, down: 2 }, DayVotes { day: fixed, up: 50, down: 50 }, DayVotes { day: fixed + 1, up: 6, down: 1 }, DayVotes { day: fixed + 3, up: 3, down: 0 }];
    let e = fix_effect(&days, fixed);
    assert_eq!((e.before.up, e.before.down, e.before.votes), (2, 10, 12));
    assert_eq!((e.after.up, e.after.down, e.after.votes), (9, 1, 10));
    assert_eq!(e.verdict, EffectVerdict::Lower);
    let few = fix_effect(&days[..4], fixed);
    assert!(few.after.votes < MIN_VOTES);
    assert_eq!(few.verdict, EffectVerdict::TooFewVotes);
    let worse = fix_effect(&[DayVotes { day: 1, up: 10, down: 0 }, DayVotes { day: 6, up: 5, down: 5 }], 5);
    assert_eq!(worse.verdict, EffectVerdict::NotLower);
}

#[test]
fn day_of_is_utc_days() {
    assert_eq!(day_of(0), 0);
    assert_eq!(day_of(86_400_000 - 1), 0);
    assert_eq!(day_of(1_762_700_000_000), 1_762_700_000_000 / 86_400_000);
}
