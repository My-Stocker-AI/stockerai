# Voice Reliability Overhaul — Design Document

**Date:** 2026-03-03
**Author:** Claude (with user approval)
**Audit:** `docs/audits/AUDIT_20260303_voice_reliability.md`
**Status:** APPROVED — ready for implementation plan

---

## Problem Statement

Davy (route driver) reports voice commands stopped working reliably after the Feb 25 commit (d9a06dd). Specifically: if there's any delay between item announcement and his response, commands are not recognized. He must pull-to-refresh, and even then commands sometimes don't work. A systemic audit identified 9 reliability issues in `src/hooks/useVoice.ts`, ranging from the primary regression to latent bugs affecting fast-command recognition and long-session reliability.

**User requirement:** "They want reliability in always being able to say something and have it understood. They don't want it to go to sleep in the middle of a pick. They want all the commands to work as designed. All of this to work, all the time, quickly and reliably."

---

## Root Cause of Regression

Commit d9a06dd introduced a **proactive token refresh** that fires at ~7.5 minutes into every session. When it fires:

1. Socket closes (code 1000)
2. `socket.onclose` checks `statusRef.current`
3. If status is `'speaking'` or `'thinking'` → reconnect NOT triggered (excluded from conditions)
4. TTS finishes → `resumeListening()` called
5. `mediaRecorderRef.current.state === 'paused'` → TRUE (recorder was paused during TTS)
6. MediaRecorder resumes to the **dead socket** — zombie state
7. App shows `'listening'`, audio silently dropped

---

## Design: 9 Fixes

### Fix 1 — Proactive Token Refresh: Wait for Safe Status
**File:** `useVoice.ts` — `socket.onopen` handler (~line 626)

**Problem:** Refresh fires regardless of current status. If Davy is mid-TTS or mid-API-call, socket closes but no reconnect happens. When TTS ends, `resumeListening()` resumes to dead socket.

**Fix:** Instead of firing immediately, the refresh timer polls `statusRef.current` every 3 seconds until a safe state is reached (`'listening'`, `'paused'`, or `'muted'`). Cap polling at 30 seconds (maximum wait before token expires is ~90s anyway).

```typescript
function scheduleTokenRefreshWhenSafe() {
  const isSafe = ['listening', 'paused', 'muted'].includes(statusRef.current);
  if (isSafe && socketRef.current?.readyState === WebSocket.OPEN && shouldReconnectRef.current) {
    tokenExpiryRef.current = 0;
    reconnectAttemptsRef.current = 0;
    socketRef.current.close(1000, 'Token refresh');
  } else if (socketRef.current?.readyState === WebSocket.OPEN && shouldReconnectRef.current) {
    // Not safe yet — retry in 3s
    tokenRefreshTimerRef.current = setTimeout(scheduleTokenRefreshWhenSafe, 3000);
  }
  // If socket already closed, nothing to do
}

// In socket.onopen:
if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
const msUntilRefresh = tokenExpiryRef.current - Date.now() - 90000;
if (msUntilRefresh > 0) {
  tokenRefreshTimerRef.current = setTimeout(scheduleTokenRefreshWhenSafe, msUntilRefresh);
}
```

**Result:** Refresh only fires when Davy is between commands. 1-2s reconnect gap occurs during a natural pause, not mid-speech.

---

### Fix 2 — resumeListening(): Check Socket Liveness Before Resuming
**File:** `useVoice.ts` — `resumeListening()` (~line 966)

**Problem:** Branch (a) resumes MediaRecorder without verifying the WebSocket is open. If socket died (for any reason), audio is sent to a closed connection — zombie state.

**Current (buggy):**
```typescript
if (mediaRecorderRef.current?.state === 'paused') {
  mediaRecorderRef.current.resume();  // ZOMBIE: doesn't check socket
  isRecordingRef.current = true;
  setStatus('listening');
}
```

**Fix:**
```typescript
if (mediaRecorderRef.current?.state === 'paused' && socketRef.current?.readyState === WebSocket.OPEN) {
  // Socket alive — safe to resume
  mediaRecorderRef.current.resume();
  isRecordingRef.current = true;
  setStatus('listening');
} else if (mediaRecorderRef.current?.state === 'paused') {
  // Socket dead — stop recorder and do full reconnect
  try {
    mediaRecorderRef.current.ondataavailable = null;
    mediaRecorderRef.current.stop();
  } catch (e) { /* ignore */ }
  mediaRecorderRef.current = null;
  isRecordingRef.current = false;
  startListening();
}
```

**Result:** Any scenario where socket closes while MediaRecorder is paused (token refresh, network blip, etc.) triggers a clean reconnect instead of zombie state.

---

### Fix 3 — Add 'thinking' to Reconnect Conditions
**File:** `useVoice.ts` — `socket.onclose` handler (~line 685)

**Problem:** If socket closes while status is `'thinking'` (between transcript received → API response), no reconnect is triggered. By the time TTS plays and `resumeListening()` is called, Fix 2 handles it — but it's better to start reconnecting immediately.

**Current:**
```typescript
if (shouldReconnectRef.current && (currentStatus === 'listening' || currentStatus === 'paused' || currentStatus === 'muted')) {
```

**Fix:**
```typescript
if (shouldReconnectRef.current && (currentStatus === 'listening' || currentStatus === 'paused' || currentStatus === 'muted' || currentStatus === 'thinking')) {
```

**Result:** Socket drop during API call immediately starts background reconnect. Reconnect (1s minimum) typically completes before the API response + TTS finishes. Voice is ready when Davy needs to speak again.

---

### Fix 4 — TTS Fetch Timeout in speak()
**File:** `useVoice.ts` — `fetch(TTS_URL)` inside `speak()` (~line 1179)

**Problem:** No timeout on TTS fetch. Slow Cloudflare Worker hangs `speak()` indefinitely. `processingRef` stays locked. All subsequent commands rejected until page refresh.

**Fix:**
```typescript
const response = await fetch(TTS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: processed, voice: 'nova' }),
  signal: AbortSignal.timeout(15000)  // ADD
});
```

**Result:** After 15s, AbortError thrown → caught by existing try/catch → falls back to `speakBrowser()` → `processingRef` released in `finally` block. System recovers automatically.

---

### Fix 5 — ensureToken() Fetch Timeout
**File:** `useVoice.ts` — `ensureToken()` (~line 341)

**Problem:** No timeout on token fetch. If Cloudflare Worker for token is slow/unresponsive, every reconnect attempt hangs indefinitely. System frozen — no commands processed.

**Fix:**
```typescript
const response = await fetch(DEEPGRAM_TOKEN_URL, {
  signal: AbortSignal.timeout(10000)  // ADD
});
```

**Result:** Token fetch fails fast after 10s → `connectDeepgram()` throws → reconnect attempt counted → exponential backoff continues → Fix 6 provides eventual recovery.

---

### Fix 6 — Recovery After Max Reconnect Attempts
**File:** `useVoice.ts` — `socket.onclose` max attempts handler (~line 688)

**Problem:** After 5 failed reconnect attempts, system sets `'error'` state and stops trying permanently. In a 3-hour session over cellular, 5 consecutive failures is realistic (brief dead zone, handoff). Requires page refresh to recover.

**Current:**
```typescript
if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
  onErrorRef.current?.('Connection lost. Please refresh the page.');
  return;  // Give up forever
}
```

**Fix:**
```typescript
if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
  console.warn('[Voice] Max reconnect attempts reached - waiting 30s before retry');
  emitDiagnostic('reconnect-max-reached', { timestamp });
  // Don't give up — schedule recovery attempt in 30s
  reconnectTimeoutRef.current = setTimeout(() => {
    if (shouldReconnectRef.current) {
      console.log('[Voice] Recovery attempt after max retries');
      reconnectAttemptsRef.current = 0;
      startListening();  // Full restart
    }
  }, 30000);
  return;
}
```

**Result:** After 5 failures, waits 30s then attempts fresh reconnect. For a 3-hour session, system is self-healing. User never needs to refresh due to transient network conditions.

---

### Fix 7 — Echo Cooldown 800ms → 300ms
**File:** `useVoice.ts` — `ECHO_COOLDOWN_MS` constant (~line 90)

**Problem:** After TTS ends, voice is blocked for 800ms. Timeline: TTS ends → `lastSpeakTimeRef` set → beep plays → 100ms wait → `resumeListening()`. An experienced driver like Davy who responds immediately after the beep speaks within 200-400ms of TTS end — filtered as echo. He says command twice, thinks system is unreliable.

**Fix:**
```typescript
const ECHO_COOLDOWN_MS = 300;  // Was: 800
```

**Note:** The secondary echo check (text similarity at lines 121-126) still filters actual speaker echo. The 300ms cooldown is a blanket noise filter; the text check handles real echoes. 300ms is sufficient for the microphone to settle after audio playback.

**Result:** Experienced drivers get immediate command recognition after the ready beep.

---

### Fix 8 — AudioContext Reuse on iOS/Desktop
**File:** `useVoice.ts` — `speak()` iOS/Desktop branch (~lines 1267-1279)

**Problem:** On iOS/Desktop, every `speak()` call closes the AudioContext and creates a new one. This adds latency between command and audio response (context initialization is expensive) and can cause audio glitches during rapid item processing.

**Current:**
```typescript
// Closes and recreates on EVERY speak()
await audioContextRef.current.close();
const audioContext = new AudioContextClass({ sampleRate: 44100 });
audioContextRef.current = audioContext;
```

**Fix:** Reuse existing AudioContext unless it's in `'closed'` state:
```typescript
let audioContext: AudioContext;
if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  audioContext = new AudioContextClass({ sampleRate: 44100 });
  audioContextRef.current = audioContext;
} else {
  audioContext = audioContextRef.current;
  // Resume if suspended
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
}
```

**Result:** Faster TTS playback start. Consistent audio routing. Existing health monitor (every 10s) handles suspended context between speaks.

---

### Fix 9 — prefetchTTS Fetch Timeout
**File:** `useVoice.ts` — `fetch(TTS_URL)` inside `prefetchTTS()` (~line 1411)

**Problem:** Prefetch fetch has no timeout. If it hangs and `speak()` awaits the cached promise, `speak()` hangs — same effect as Fix 4 but via the prefetch path.

**Fix:**
```typescript
const fetchPromise = fetch(TTS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: processed, voice: 'nova' }),
  signal: AbortSignal.timeout(15000)  // ADD
})
```

**Result:** Prefetch fails fast → cache cleared → `speak()` retries normally fetch (also with timeout from Fix 4). No hung promises.

---

## What Is NOT Changed

These fixes from d9a06dd/4c7acb6 are preserved and must not be touched:

| Fix to Preserve | Location |
|----------------|----------|
| Stop old MediaRecorder before creating new one | `setupMediaRecorder()` line 520-528 |
| Null `ondataavailable` before stopping old recorder | `setupMediaRecorder()` line 523 |
| skip_machine route_complete flags | `useStockerSession.ts` |
| Phonetic phrase corrections ("bought them" → "bottom") | `commandRecognizer.ts` |
| speakBrowser 15s timeout | `useVoice.ts` speakBrowser() |
| acquireSpeakLock 20s timeout | `useVoice.ts` acquireSpeakLock() |
| catch/finally in speak() | `useVoice.ts` speak() |

---

## Files Changed

| File | Changes |
|------|---------|
| `src/hooks/useVoice.ts` | All 9 fixes (~40 lines changed) |
| No other files | Audit confirmed: no upstream/downstream contract changes |

---

## Success Criteria

After implementation, Davy should be able to:
1. Run a 3-hour route without voice degrading at any point
2. Say any command at any time — immediately after TTS, after a 10-minute pause, during reconnect — and be understood
3. Never need to pull-to-refresh during a session
4. Get immediate response after the ready beep (no phantom echo filtering)
