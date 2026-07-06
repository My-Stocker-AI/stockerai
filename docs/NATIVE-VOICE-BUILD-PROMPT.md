# Native Voice Build — New Session Prompt

Paste everything below the line into a fresh Claude Code session started from the StockerAI directory.

---

Build the native voice bulletproofing for StockerAI. The full approved plan is in `docs/specs/2026-07-01-native-voice-bulletproof.md` — read it first, it's the source of truth.

**The promise:** any operator — not just us — can rely on every item for every machine being announced and advanced by voice, straight through screen-lock and the app being backgrounded, with natural phrasing preserved ("alright, next item", "ok let's go back", "yep, next one"). This has to hold for a stranger's voice, a stranger's accent, in a noisy warehouse. Signal/network is a hard requirement — do NOT engineer around offline; if they lose signal, they get to a signal. That's settled, don't relitigate it.

**Root cause already proven last session (don't re-diagnose):** the browser can't keep the mic alive when the phone locks, and the cloud speech stream goes "deaf" (fires voice-detected events with zero transcripts). Both are symptoms of running voice in a mobile browser. The fix is a native layer, not another patch.

**Architecture (already decided in the spec):** Capacitor shell + a native always-listening mic plugin (iOS AVAudioSession background-audio; Android microphone foreground service) + on-device recognition (Vosk cross-platform, or iOS SpeechAnalyzer + Android Vosk) feeding the existing fuzzy command matcher in `commandRecognizer.ts`. Deepgram gets demoted to an optional fallback, off the hot path.

**Protect the natural-phrasing smarts — this is a hard requirement, not an afterthought:** the loose-phrasing matcher in `commandRecognizer.ts` (the thing that turns "alright, next item" into *next*) stays exactly as-is — it works on words regardless of source. The real risk is upstream: the on-device listener must hear accurately enough to hand that matcher clean text. Tune the on-device engine toward the tiny command vocabulary (next, back, skip, done, repeat, previous + directions) so it locks onto those even in warehouse noise. Deepgram stays on the bench for rare weird phrasing.

**Start with Phase 1** (native mic + background audio, both OSes, survives lock). Spec it via /xffi first if scope needs tightening, then build.

**Acceptance — all must pass, on real devices:**
1. Full route walk on iOS (Davy) and Android, screen locked mid-route — every item announced and advanced by voice, no deaf/stall.
2. **Natural-phrasing coverage is a hard gate:** a scripted list of loose phrasings ("alright next", "ok go back", "yep next one", "skip this one", "say that again") each correctly advances/acts — measured, not assumed. Build this list and run it on-device.
3. On-device hearing accuracy measured against that list so we know real coverage before Deepgram is demoted.

**Constraints:** short answers, plain language for a non-technical builder, prove claims with data/logs — don't guess. Render logs key and Supabase key are in `StockerAI/.env`.
