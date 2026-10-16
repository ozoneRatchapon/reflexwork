# Tasks — Voice (STT → kernel → TTS)

> Kiro spec-driven · phase 3/3 · derived from design.md. [x] done · [ ] todo

## V1 — Voice input
- [x] 1.1 Mic button in the chatbot input row
- [x] 1.2 Browser STT (Web Speech API, th-TH) → fills input → ask()
- [x] 1.3 Local STT hook: `?stt=` → MediaRecorder → POST blob → {text}
- [x] 1.4 Graceful disable + hint when neither is available

## V2 — Voice output
- [x] 2.1 "อ่านคำตอบออกเสียง" toggle
- [x] 2.2 Browser TTS (speechSynthesis, th-TH) reads the .ans text
- [x] 2.3 Local TTS hook: `?tts=` → POST {text} → play returned audio

## V3 — Privacy
- [x] 3.1 No cloud speech API in the default path (browser engine / local only)

## V4 — Local server upgrade (operator steps — not bundled)
- [ ] 4.1 Stand up a local Whisper STT server exposing `POST /stt`
- [ ] 4.2 Stand up a local Thai TTS server exposing `POST /tts`
- [ ] 4.3 Expose them publicly (tunnel) if the Pages chatbot must reach them,
      or run the chatbot locally; set `?stt=`/`?tts=`
- [ ] 4.4 Add STT/TTS liveness to health-check.sh
- [ ] 4.5 A/B browser TTS vs local Thai TTS on real questions; pick a voice

## Verification
- [x] Manual: Chrome mic transcribes Thai → asks → answer read aloud
- [ ] With a local Whisper: `?stt=` round-trip returns correct text
- [ ] Record a demo clip (browser-recording skill) for the pitch
