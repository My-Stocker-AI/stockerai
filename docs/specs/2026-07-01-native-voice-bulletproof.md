# Native Voice Bulletproofing — StockerAI

**Date:** 2026-07-01 · **Decision owner:** Russ · **Status:** Approved plan, not yet built.

## Goal (the promise)
The picker can rely on **every item for every machine being announced and advanced by voice** — through screen-lock, pocket, and app-background — with **natural phrasing preserved** ("alright, next item", "ok let's go back"). Network/signal is a hard requirement (not engineered around); signal is only needed to load route data, not for the listening loop.

## Root cause (proven this session)
1. **The browser can't keep the mic alive when the phone locks/backgrounds.** iOS WebKit auto-mutes `getUserMedia` capture shortly after backgrounding; Android pauses/throttles WebView JS + timers off-foreground. Not fixable in-WebView.
2. **The cloud speech stream goes "deaf"** — Deepgram's voice-detector keeps firing while the decoder returns zero transcripts (browser MediaRecorder WebM/Opus container drift on a half-open socket; socket still reports OPEN so nothing triggers a reconnect). Proven in Davy's 2026-07-01 A3 logs.

## Recommended architecture (authoritative, researched)
**Capacitor shell + a NATIVE always-listening voice plugin + on-device recognition + the existing natural-language matcher. Deepgram demoted to optional cloud fallback.**

- **Shell:** keep the Capacitor web app for all UI/route logic. Only the always-on audio path moves native.
- **Mic + recognition live in a NATIVE plugin (not the WebView)** — the only thing that survives lock on both OSes:
  - **iOS:** `AVAudioSession` category `playAndRecord` + `UIBackgroundModes: audio` in Info.plist; capture via AVAudioEngine in Swift.
  - **Android:** a `microphone`-typed **foreground service** (`FOREGROUND_SERVICE_MICROPHONE` + `RECORD_AUDIO` + `WAKE_LOCK`) with a persistent notification.
- **On-device recognition (no cloud in the listening loop → cannot go deaf):**
  - **iOS 26+:** `SpeechAnalyzer`/`SpeechTranscriber` (built for continuous on-device transcription). Pre-26 fallback: on-device `SFSpeechRecognizer` with a re-arming session manager.
  - **Android:** **Vosk** (Apache-2.0, on-device, continuous, ~50MB) — more reliable than the native `SpeechRecognizer`, which is explicitly "not for continuous recognition." Vosk can also be the single uniform engine on BOTH platforms if we want to avoid per-OS divergence.
- **Natural phrasing preserved:** the engine emits **free-form text** → feed it to the **existing local fuzzy/synonym intent matcher** (`commandRecognizer.ts` logic). Bias recognition toward the tiny command vocabulary (next/back/skip/repeat/confirm/done + direction) for warehouse-grade robustness. This is NOT rigid keywords — intent is matched from text.
- **Deepgram:** demote to optional cloud fallback for rare ambiguous utterances only (hardened: raw PCM via AudioWorklet, KeepAlive ~5s, transcript-gap watchdog). Never the always-on path.

**Why this over alternatives:** hardening the Deepgram PWA can't survive lock (proven); pure fixed-grammar engines (Picovoice Rhino) throw away natural phrasing. This is also what the reliable voice-picking industry (Zebra, Honeywell/Vocollect) actually does: on-device, small constrained vocabulary, close-talk mic.

## Phases
1. **Native mic + background audio plugin**, both OSes (survives lock/pocket/background). Bridge audio/events to the WebView via Capacitor.
2. **On-device recognition** (Vosk cross-platform, or iOS SpeechAnalyzer + Android Vosk) feeding the existing intent matcher.
3. **Demote Deepgram** to optional fallback; remove it from the hot path.
4. **Acceptance = real-device walks:** Davy (iOS) + Russ (Android) walk a full route, **lock the screen mid-route**, confirm every item is announced + advanced by voice with no deaf/stall.

## Honest tradeoffs
1. Real native code (Swift + Kotlin), or adopt/fork existing Capacitor mic/foreground-service plugins. No WebView shortcut survives lock.
2. On-device accuracy < cloud — mitigated hard by the tiny command vocabulary + phrase-list biasing + the fuzzy matcher (industry proves constrained on-device beats open cloud in noise).
3. iOS 26 for the best engine; Vosk sidesteps the OS-version dependency.
4. Non-suppressible privacy UI (iOS red mic indicator, Android persistent notification) + extra App Store review for background audio. Expected/acceptable for a genuine hands-free work tool.

## Open items to verify on a real device before locking build choices
- iOS **indefinite background mic** capture (soak test — rests on VoIP precedent + AVAudioSession behavior, not one explicit Apple doc line).
- Picovoice licensing/quotas IF Porcupine wake-word is used (optional, battery-saving).
- Android ML Kit GenAI (Gemini Nano) vs Vosk — benchmark before choosing.
- How much natural phrasing the current local matcher already nails vs. punts to cloud (measure, so on-device coverage is known).

**Kept this session as cheap insurance (not the real fix):** lock/background reconnect handler (commit e49d5e4) + deaf-detector (commit 651dc93). Superseded by this native architecture.
