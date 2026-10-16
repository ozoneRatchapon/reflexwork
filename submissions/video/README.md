# ReflexWork explainer video (fframes)

An 18s motion-graphics explainer rendered **from Rust code** with
[fframes](https://github.com/dmtrKovalenko/fframes) (SVG scenes → Skia GPU →
ffmpeg). On-brand: the whole product is Rust, and so is its video.

3 scenes: (1) the filter in front of the LLM, (2) the 4-way decision,
(3) the self-improving learning loop.

## Render
```bash
cargo install --locked cargo-fframes   # once
cd submissions/video && cargo run --release -- render   # → out.mp4
cargo run --release -- preview          # real-time window
cargo run --release -- strip -n 9       # contact sheet
```
Outputs committed: `reflexwork-explainer.mp4`, `reflexwork-explainer.gif`.

Note: pin `usvgr = 0.46.0` if a newer transitive version breaks the fframes
build (non-exhaustive `usvgr::Node::FastShape` match). Thai text uses the
bundled `Sathu.ttf` (DM Sans has no Thai glyphs).
