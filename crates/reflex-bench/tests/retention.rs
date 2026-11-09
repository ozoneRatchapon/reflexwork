use reflex_bench::retention::{GateVerdict, Retention};

#[test]
fn counts_swaps_not_only_the_net() {
    let shipped = [true, true, true, true, false, false, false, false, true, true];
    let challenger = [true, false, false, true, true, true, true, false, true, true];
    let r = Retention::of(&shipped, &challenger);
    assert_eq!((r.kept, r.lost, r.gained), (4, 2, 3));
    assert_eq!(r.net(), 1);
    assert!((r.retained() - 4.0 / 6.0).abs() < 1e-12);
    assert_eq!(r.verdict(0.95), GateVerdict::BreaksTooMuch, "a net gain that breaks a third of shipped's answers is refused");
}

#[test]
fn adopts_a_clean_gain_and_refuses_no_gain() {
    let r = Retention::of(&[true, true, false, false], &[true, true, true, false]);
    assert_eq!(r.verdict(0.95), GateVerdict::Adopt);
    let same = Retention::of(&[true, false], &[true, false]);
    assert_eq!(same.verdict(0.95), GateVerdict::NoNetGain);
    assert_eq!(Retention::of(&[false], &[false]).retained(), 1.0);
}
