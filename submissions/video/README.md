# ReflexWork explainer video (fframes / ffilms)

An 18s motion-graphics explainer rendered **from Rust code** — built as a proper
**ffilms kit** (`kits/reflexwork/`) in the solana-thailand-devrel-helper ffilms
workspace, reusing its shared primitives (kinetic type, stepper, cards, Thai
shaping, Pack/tokens). On-brand: the product is Rust, so is its video.

3 scenes: (1) the filter in front of the LLM, (2) the 4-way decision,
(3) the self-improving learning loop. TH + EN.

## Render (in the ffilms workspace)
```bash
# kit lives at: ffilms/kits/reflexwork/{tokens.rs, scenes/mod.rs, bin/explainer.rs}
cd ffilms
./ff reflexwork explainer inspect              # checks
./ff reflexwork explainer strip -n 9           # contact sheet
./ff reflexwork explainer render               # th (default)
./ff reflexwork explainer render --lang en     # english
```

## Outputs (committed here)
- `reflexwork-explainer.mp4` (TH), `reflexwork-explainer-en.mp4` (EN)
- `reflexwork-explainer.gif`, `reflexwork-strip.png`

Dark theme matches the pitch deck; Thai via Anuphan, display via Space Grotesk.
