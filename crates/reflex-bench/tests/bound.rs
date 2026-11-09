use reflex_bench::bound::{cp_upper, reg_inc_beta};
use reflex_bench::data::{short, typo};

#[test]
fn zero_events_has_the_closed_form() {
    // k = 0: (1 - p)^n = delta  =>  p = 1 - delta^(1/n)
    for n in [1usize, 10, 50, 300] {
        let want = 1.0 - 0.05_f64.powf(1.0 / n as f64);
        assert!((cp_upper(0, n, 0.05) - want).abs() < 1e-9, "n={n}");
    }
}

#[test]
fn known_values() {
    // reference values from the binomial CDF by bisection (independent of this code): 1/10 -> 0.3942, 5/100 -> 0.1023, 50/100 -> 0.5864, 73/348 -> 0.2489
    assert!((cp_upper(1, 10, 0.05) - 0.3942).abs() < 5e-4);
    assert!((cp_upper(5, 100, 0.05) - 0.1023).abs() < 5e-4);
    assert!((cp_upper(50, 100, 0.05) - 0.5864).abs() < 5e-4);
    assert!((cp_upper(73, 348, 0.05) - 0.2489).abs() < 5e-4);
    assert_eq!(cp_upper(3, 0, 0.05), 1.0);
    assert_eq!(cp_upper(4, 4, 0.05), 1.0);
}

#[test]
fn incomplete_beta_symmetry() {
    for (a, b, x) in [(2.0, 3.0, 0.3), (5.5, 1.5, 0.8), (10.0, 40.0, 0.2)] {
        assert!((reg_inc_beta(a, b, x) + reg_inc_beta(b, a, 1.0 - x) - 1.0).abs() < 1e-12);
    }
}

#[test]
fn question_variants_match_the_js_experiment() {
    assert_eq!(short("a b c d e f g h"), "a b c d e f");
    // drops the Thai consonant at code-point index 2, then at 9 (after the shift)
    assert_eq!(typo("ส่งรูปเล่มวิทยานิพนธ์ภายในกี่วัน"), {
        let mut c: Vec<char> = "ส่งรูปเล่มวิทยานิพนธ์ภายในกี่วัน".chars().collect();
        c.remove(2);
        c.remove(9);
        c.into_iter().collect::<String>()
    });
}
