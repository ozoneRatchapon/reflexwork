# Design — Voice (STT → kernel → TTS)

> Kiro spec-driven · phase 2/3 · implements requirements.md

## Flow
```
🎤 mic ─┬─ ?stt set → MediaRecorder → POST blob → local Whisper /stt → {text}
        └─ else      → Web Speech API SpeechRecognition (th-TH)
                           │
                           ▼ text
                    kernel route (FastPath / hybrid / abstain / intake)
                           │ answer (.ans text)
        ┌─ ?tts set → POST {text} → local Thai TTS /tts → audio → <audio> play
🔊 ─────┴─ else      → Web Speech API speechSynthesis (th-TH)
```

## Components
| component | role | status |
|---|---|---|
| chatbot `setupVoice()` | mic → STT (local or browser) → ask() | ✅ implemented |
| chatbot `speak()` | answer → TTS (local or browser) | ✅ implemented |
| local Whisper server | `POST /stt` (audio → {text}) | ⬜ operator step |
| local Thai TTS server | `POST /tts` ({text} → audio bytes) | ⬜ operator step |

## Contracts (for the local servers)
- **STT**: `POST <stt>` body = audio bytes (webm/opus from MediaRecorder);
  response `{ "text": "..." }`.
- **TTS**: `POST <tts>` body = `{ "text": "..." }`; response = audio bytes
  (audio/mpeg or audio/wav), played via an `Audio` element.

## Local server options (operator picks)
- STT: **whisper.cpp** `server` (multilingual, Thai OK) or **faster-whisper** +
  a tiny HTTP wrapper.
- TTS: a **Piper/Coqui Thai voice** or an offline Thai TTS behind an HTTP wrapper.

## Decisions & rationale
- **Browser default, local upgrade** — demo works with zero setup; the `?stt=`/
  `?tts=` hooks let an operator swap in better Thai without an app rebuild
  (mirrors the `?api=` hook for the LLM path).
- **Record → transcribe (not streaming)** — simpler, good enough for Q&A, and
  one clean request to the local server.
- **No cloud speech API** — keeps the PDPA posture intact.

## Testing strategy
- Manual: mic in Chrome transcribes Thai → asks → answer read aloud.
- With a local Whisper: `?stt=` returns `{text}` and the query fills correctly.
- Unit: the STT/TTS selection logic (local-vs-browser) is a small branch —
  cover with a DOM-free helper if extracted.
