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

## Pitch backup demo videos (2026-11-06) - play these if the site cannot be used on stage
Recorded by `scripts/record_demo.mjs` from the scenario JSON next to each video (1920x1080, a yellow dot shows each tap; headless Chrome has no mouse).
The older `reflexwork-screen-demo.mp4` (16 Oct) shows wording the pitch no longer uses (BLAKE3 "proof", gate readout) - do not use it on stage.

| Video | What it shows | Backend |
|---|---|---|
| `backup-demo-1-itm.mp4` (~30 s) | `สมัคร ITM` → 2 programmes → tap the master's (ภาคพิเศษ) → card 🟢 open + schedule → tap `แล้วค่าเทอมล่ะ` → that programme's fees; the evidence panel says 0 token / no AI | **production** (`reflexwork.pages.dev/chatbot?view=judge`), read-only questions |
| `backup-demo-2-staff-loop.mp4` (~65 s) | a question the manual lacks (official FAQ 76) → "cannot answer" → dashboard: tap `ตอบ`, type the official FAQ 76 answer, `บันทึกและอนุมัติ` → back to the chat, ask again → 📝 เจ้าหน้าที่ตอบ | **local** in-memory kernel (`scripts/demo_mock_server.mjs`, `--mock`), pages served from git `6b9d7b5` - `chatbot.html`, `dashboard.html`, `knowledge-index.json` and `wasm/` checked byte-identical to production on 6 Nov; AI off; nothing was written to production |

Re-record (fails and writes nothing if any step does not show what it should):
```bash
node scripts/record_demo.mjs submissions/video/backup-demo-1-itm.json submissions/video/backup-demo-1-itm.mp4
node scripts/record_demo.mjs submissions/video/backup-demo-2-staff-loop.json submissions/video/backup-demo-2-staff-loop.mp4 --mock
```
Say on stage for video 2: "คลิปนี้อัดบนเครื่องทดสอบ ไม่ได้เขียนลงระบบจริง". The staff answer is the Graduate School's own FAQ 76 text (only the source's broken "ให ม่" is written "ใหม่").
