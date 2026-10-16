# Voice: local Whisper STT + Thai TTS

> How ReflexWork does voice, and how to upgrade from the browser default to
> local, higher-quality Thai speech. Honest about what ships today vs. what the
> upgrade needs.

## What ships today (working, 0 setup)
The chatbot uses the **Web Speech API** (browser-native):
- 🎤 mic → `SpeechRecognition` (lang `th-TH`) → fills the input → asks.
- "อ่านคำตอบออกเสียง" toggle → `speechSynthesis` reads the answer.
- No audio leaves the app beyond the browser's own engine. Works in Chrome;
  degrades gracefully (mic disabled) where unsupported.

Good enough for a demo. Limitation: browser Thai STT/TTS quality varies by OS
and isn't controllable.

## The upgrade: local Whisper (STT) + Thai TTS
For better, controllable Thai — and to keep audio fully on a machine you own —
run local speech services alongside Ollama and point the chatbot at them.

### STT — Whisper (speech → text)
Options (pick one), all local:
- **whisper.cpp** server: `./server -m ggml-large-v3.bin --host 127.0.0.1 --port 9000`
  (Thai is supported by multilingual Whisper models).
- **faster-whisper** (Python) behind a tiny HTTP wrapper.
Expose `POST /stt` (audio blob → `{text}`). The chatbot records with
`MediaRecorder`, POSTs the blob, and uses the returned text as the query.

### TTS — Thai (text → speech)
Options (pick one), all local:
- **VAJA / Google Thai TTS offline voices**, or
- an open Thai TTS (e.g. a Coqui/Piper Thai voice) behind `POST /tts`
  (`{text}` → audio bytes). The chatbot plays the returned audio instead of
  `speechSynthesis`.

### Wiring (no app rebuild)
The chatbot reads optional query params:
- `?stt=http://127.0.0.1:9000/stt` — use local Whisper instead of browser STT.
- `?tts=http://127.0.0.1:9001/tts` — use local Thai TTS instead of browser TTS.
When unset, it falls back to the Web Speech API (today's default). This mirrors
how `?api=` points the LLM path at a local/tunnelled model.

> Implemented in code: the chatbot reads `?stt=`/`?tts=`, records with
> `MediaRecorder` and POSTs to the local STT endpoint, and plays audio from the
> local TTS endpoint — falling back to the Web Speech API when the params are
> unset. What is NOT bundled: the local Whisper/TTS servers themselves
> (whisper.cpp / a Thai TTS), which are an owner step like `ollama pull`. File
> the server setup as a `.kiro/specs/voice/` feature when you stand it up.

## Privacy
Both the browser default and the local-server upgrade keep audio on a machine
you control (browser engine, or your own Whisper/TTS box) — consistent with
ReflexWork's "no data leaves the box" positioning (PDPA).
