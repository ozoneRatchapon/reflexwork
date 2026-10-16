# Requirements — Voice (STT → kernel → TTS)

> Kiro spec-driven workflow · phase 1/3 · feature: voice input/output for the chatbot.

## Problem statement
Some users (visually impaired, on mobile, hands busy, or simply preferring
speech) want to ask by voice and hear the answer. The chatbot must accept voice
and read answers aloud — in Thai — while keeping ReflexWork's "no data leaves
the box" posture.

## User stories & acceptance criteria (EARS)

### V1 — Voice input (STT)
As a user, I want to speak my question instead of typing.
- WHEN the user taps the mic, THE SYSTEM SHALL capture speech and transcribe it
  to Thai text, then run it through the normal kernel route.
- WHERE a local STT endpoint is configured (`?stt=`), THE SYSTEM SHALL use it;
  OTHERWISE it SHALL fall back to the browser Web Speech API.
- WHERE neither is available, THE SYSTEM SHALL disable the mic with a hint.

### V2 — Voice output (TTS)
As a user, I want the answer read aloud.
- WHEN the "read aloud" toggle is on and a bot answer is rendered, THE SYSTEM
  SHALL speak the ANSWER text (not the proof/meta).
- WHERE a local TTS endpoint is configured (`?tts=`), THE SYSTEM SHALL use it;
  OTHERWISE it SHALL fall back to the browser speechSynthesis.

### V3 — Privacy
- THE SYSTEM SHALL keep audio on a machine the user controls (browser engine,
  or a local Whisper/TTS server the operator runs) — no third-party audio API
  by default (PDPA).

### V4 — Quality upgrade path
As an operator, I want better Thai than the browser default.
- THE SYSTEM SHALL support a local Whisper STT server and a local Thai TTS
  server, pointed to via `?stt=` / `?tts=`, with no app rebuild.

## Non-goals
- No cloud speech API (Google/Azure/AWS Transcribe) in the default path.
- No speaker identification / biometric voice.
- Real-time streaming STT is out of scope (record → transcribe is enough).

## Status
- V1/V2 browser path: IMPLEMENTED (Web Speech API) and deployed.
- V1/V2 local hooks (`?stt=`/`?tts=`): IMPLEMENTED in the chatbot.
- V4 local servers (whisper.cpp / Thai TTS): NOT bundled — operator step
  (design + tasks below).
