# Voice Reliability Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all zombie state vectors, reconnect failures, and command-drop bugs in `useVoice.ts` so Davy can run a full 3-hour route without voice degrading.

**Architecture:** All 9 fixes are contained in `src/hooks/useVoice.ts`. No backend, database, or API changes. Fixes are ordered from safest/simplest to most complex. Each fix is independently testable and committable.

**Tech Stack:** React + TypeScript, Deepgram WebSocket STT, Web Audio API, MediaRecorder API, Cloudflare Workers (TTS + token endpoints)

**Design doc:** `docs/plans/2026-03-03-voice-reliability-design.md`
**Audit:** `docs/audits/AUDIT_20260303_voice_reliability.md`

---

## BEFORE YOU START

Read the design doc fully before touching any code. Each fix has a precise rationale — do not simplify or combine differently than specified.

Key file: `src/hooks/useVoice.ts` (~1580 lines)

**Exact line references (verify before editing — line numbers may shift as you apply fixes):**
- Line 90: `const ECHO_COOLDOWN_MS = 800;`
- Line 341: `const response = await fetch(DEEPGRAM_TOKEN_URL);` (ensureToken)
- Lines 628-640: proactive token refresh block (inside socket.onopen)
- Line 685: reconnect condition in socket.onclose
- Lines 688-697: max reconnect attempts handler
- Lines 966-975: `resumeListening()` branches
- Line 1179: `fetch(TTS_URL)` inside speak()
- Lines 1267-1279: AudioContext close+recreate inside speak() iOS/Desktop path
- Line 1411: `fetch(TTS_URL)` inside prefetchTTS()

---

## Task 1: Fix 7 — Reduce Echo Cooldown 800ms → 300ms

**Files:**
- Modify: `src/hooks/useVoice.ts` ~line 90

**Context:** `ECHO_COOLDOWN_MS` is a blanket filter that blocks ALL input within N milliseconds of TTS ending. At 800ms, it filters Davy's commands when he responds immediately after the ready beep. 300ms is enough for microphone to settle; a separate text-similarity check (lines 121-126) still catches real echoes.

**Step 1: Make the change**

Find line 90:
```typescript
const ECHO_COOLDOWN_MS = 800;
```
Change to:
```typescript
const ECHO_COOLDOWN_MS = 300;
```

**Step 2: Verify the change**

```bash
grep -n "ECHO_COOLDOWN_MS" src/hooks/useVoice.ts
```
Expected output:
```
90:  const ECHO_COOLDOWN_MS = 300;
109:    if (Date.now() - lastSpeakTimeRef.current < ECHO_COOLDOWN_MS) {
```

**Step 3: Manual test**

Build and open the app. Start a picking session. When the item is announced, say "next" IMMEDIATELY after the ready beep (within 0.5s). The command should be recognized. Previously this would have been filtered.

**Step 4: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "Fix: reduce echo cooldown 800ms → 300ms for fast driver response"
```

---

## Task 2: Fix 4 & 9 — TTS Fetch Timeouts (speak + prefetchTTS)

**Files:**
- Modify: `src/hooks/useVoice.ts` ~line 1179 (speak) and ~line 1411 (prefetchTTS)

**Context:** Both `fetch(TTS_URL)` calls have no timeout. A slow Cloudflare Worker response hangs `speak()` indefinitely, keeping `processingRef` locked in StockerApp.tsx — all subsequent commands rejected. `AbortSignal.timeout(15000)` causes an AbortError after 15s, which the existing try/catch catches and falls back to `speakBrowser()`.

**Step 1: Add timeout to speak()**

Find the fetch call inside `speak()` (search for `fetch(TTS_URL` — will be around line 1179):
```typescript
const response = await fetch(TTS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: processed, voice: 'nova' })
});
```
Change to:
```typescript
const response = await fetch(TTS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: processed, voice: 'nova' }),
  signal: AbortSignal.timeout(15000)
});
```

**Step 2: Add timeout to prefetchTTS()**

Find the fetch call inside `prefetchTTS()` (search for the second `fetch(TTS_URL` — will be around line 1411):
```typescript
const fetchPromise = fetch(TTS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: processed, voice: 'nova' })
})
```
Change to:
```typescript
const fetchPromise = fetch(TTS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: processed, voice: 'nova' }),
  signal: AbortSignal.timeout(15000)
})
```

**Step 3: Verify both changes**

```bash
grep -n "AbortSignal.timeout" src/hooks/useVoice.ts
```
Expected: Two lines, one around 1179 and one around 1411.

**Step 4: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "Fix: add 15s AbortSignal timeout to both TTS fetch calls — prevents processingRef deadlock on slow network"
```

---

## Task 3: Fix 5 — ensureToken() Fetch Timeout

**Files:**
- Modify: `src/hooks/useVoice.ts` ~line 341

**Context:** `ensureToken()` is called on every Deepgram reconnect. Without a timeout, a slow Cloudflare Worker hangs the entire reconnect attempt indefinitely. Adding a 10s timeout causes the reconnect to fail fast, the failure is counted toward the backoff counter, and reconnect retries continue.

**Step 1: Make the change**

Find `ensureToken()` function (around line 335). Inside it, find:
```typescript
const response = await fetch(DEEPGRAM_TOKEN_URL);
```
Change to:
```typescript
const response = await fetch(DEEPGRAM_TOKEN_URL, {
  signal: AbortSignal.timeout(10000)
});
```

**Step 2: Verify**

```bash
grep -n "DEEPGRAM_TOKEN_URL" src/hooks/useVoice.ts
```
Expected: Two lines — one defining the constant (~line 9), one in the fetch call (~line 341) with the signal.

**Step 3: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "Fix: add 10s AbortSignal timeout to ensureToken fetch — prevents reconnect from hanging on slow token endpoint"
```

---

## Task 4: Fix 8 — AudioContext Reuse on iOS/Desktop

**Files:**
- Modify: `src/hooks/useVoice.ts` ~lines 1267-1279

**Context:** On iOS/Desktop, `speak()` closes and recreates `AudioContext` on every single TTS call. Creating an AudioContext is expensive — adds latency and can cause audio glitches during rapid item processing. The context should be reused; only create a new one if it's in `'closed'` state.

**Step 1: Find the iOS/Desktop branch in speak()**

Search for the comment `// iOS/DESKTOP: Use Web Audio API`. The lines immediately after look like:
```typescript
} else {
  // iOS/DESKTOP: Use Web Audio API (better quality, works fine on iOS)
  console.log('[Voice] iOS/Desktop - using Web Audio API');

  // Close old context if exists
  if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
    try {
      await audioContextRef.current.close();
    } catch (e) {
      console.warn('[Voice] Failed to close old AudioContext:', e);
    }
  }

  // Create FRESH AudioContext
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass({ sampleRate: 44100 });
  audioContextRef.current = audioContext;
```

**Step 2: Replace with reuse logic**

Replace just that block (the close + create-fresh part) with:
```typescript
} else {
  // iOS/DESKTOP: Use Web Audio API (better quality, works fine on iOS)
  console.log('[Voice] iOS/Desktop - using Web Audio API');

  // Reuse existing AudioContext if healthy — creating a new one on every speak() adds latency
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  let audioContext: AudioContext;
  if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
    audioContext = new AudioContextClass({ sampleRate: 44100 });
    audioContextRef.current = audioContext;
    console.log('[Voice] AudioContext created (new or was closed)');
  } else {
    audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log('[Voice] AudioContext resumed for playback');
      } catch (e) {
        console.warn('[Voice] AudioContext resume failed:', e);
      }
    }
    console.log('[Voice] AudioContext reused (state:', audioContext.state, ')');
  }
```

**Step 3: Verify the change**

```bash
grep -n "AudioContext created\|AudioContext reused\|Close old context" src/hooks/useVoice.ts
```
Expected: See "AudioContext created (new or was closed)" and "AudioContext reused" lines. Should NOT see "Close old context" anymore.

**Step 4: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "Fix: reuse AudioContext across TTS calls instead of close+recreate on every speak()"
```

---

## Task 5: Fix 3 — Add 'thinking' to Reconnect Conditions

**Files:**
- Modify: `src/hooks/useVoice.ts` ~line 685

**Context:** When the Deepgram socket closes while the app is waiting for an API response (status=`'thinking'`), no reconnect is triggered. This means a socket drop mid-API-call causes a zombie state. Adding `'thinking'` allows a background reconnect to start immediately while the API call completes.

**Step 1: Find the reconnect condition**

Search for `shouldReconnectRef.current && (currentStatus === 'listening'` — it will be around line 685:
```typescript
if (shouldReconnectRef.current && (currentStatus === 'listening' || currentStatus === 'paused' || currentStatus === 'muted')) {
```

**Step 2: Add 'thinking'**

```typescript
if (shouldReconnectRef.current && (currentStatus === 'listening' || currentStatus === 'paused' || currentStatus === 'muted' || currentStatus === 'thinking')) {
```

**Step 3: Verify**

```bash
grep -n "currentStatus === 'thinking'" src/hooks/useVoice.ts
```
Expected: One line in the reconnect condition.

**Step 4: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "Fix: add 'thinking' status to reconnect conditions — socket drop during API call now triggers immediate reconnect"
```

---

## Task 6: Fix 6 — Recovery After Max Reconnect Attempts

**Files:**
- Modify: `src/hooks/useVoice.ts` ~lines 688-697

**Context:** After 5 consecutive reconnect failures, the system permanently stops trying and emits "Connection lost. Please refresh the page." In a 3-hour session over cellular, 5 failures in a dead zone is realistic. The fix: instead of giving up, wait 30s and try again. `startListening()` resets all state flags to clean before reconnecting.

**Step 1: Find the max attempts handler**

Search for `Max reconnection attempts reached`. It looks like:
```typescript
if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
  console.error('[Voice] Max reconnection attempts reached - giving up', {
    timestamp,
    totalAttempts: reconnectAttemptsRef.current,
    maxAttempts: MAX_RECONNECT_ATTEMPTS
  });
  emitDiagnostic('error', 'Deepgram connection lost - please refresh');
  onErrorRef.current?.('Connection lost. Please refresh the page.');
  return;
}
```

**Step 2: Replace with recovery logic**

```typescript
if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
  console.warn('[Voice] Max reconnect attempts reached — waiting 30s before recovery attempt', {
    timestamp,
    totalAttempts: reconnectAttemptsRef.current,
    maxAttempts: MAX_RECONNECT_ATTEMPTS
  });
  emitDiagnostic('reconnect-max-reached', { timestamp, attempts: reconnectAttemptsRef.current });
  // Don't give up permanently — schedule recovery after 30s
  // This handles transient network issues (dead zones, cellular handoff) in long sessions
  reconnectTimeoutRef.current = setTimeout(() => {
    if (shouldReconnectRef.current) {
      console.log('[Voice] Recovery attempt after max retries — restarting connection');
      emitDiagnostic('reconnect-recovery', { timestamp: new Date().toISOString() });
      reconnectAttemptsRef.current = 0;
      startListening();
    }
  }, 30000);
  return;
}
```

**Step 3: Verify**

```bash
grep -n "recovery attempt\|Max reconnect attempts" src/hooks/useVoice.ts
```
Expected: Lines referencing "Max reconnect attempts reached — waiting 30s" and "Recovery attempt after max retries".

**Step 4: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "Fix: replace permanent error after max reconnects with 30s recovery timer — self-healing for 3-hour sessions"
```

---

## Task 7: Fix 2 — resumeListening(): Check Socket Liveness Before Resuming

**Files:**
- Modify: `src/hooks/useVoice.ts` ~lines 966-975

**Context:** This is one of the two core zombie state fixes. `resumeListening()` is called after every TTS playback. Branch (a) checks only whether the MediaRecorder is `'paused'` — but NOT whether the WebSocket is still open. If the socket closed (for any reason) while TTS was playing, this branch resumes the MediaRecorder to a dead socket. Audio is silently dropped; status shows `'listening'`.

**Step 1: Read the current resumeListening() function carefully**

Find `const resumeListening = useCallback(async () => {` (~line 937). The branches look like:

```typescript
if (mediaRecorderRef.current?.state === 'paused') {
  mediaRecorderRef.current.resume();
  isRecordingRef.current = true;
  setStatus('listening');
} else if (!mediaRecorderRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
  setupMediaRecorder();
  setStatus('listening');
} else if (!isConnectedRef.current) {
  startListening();
}
```

**Step 2: Replace the branch logic**

```typescript
if (mediaRecorderRef.current?.state === 'paused' && socketRef.current?.readyState === WebSocket.OPEN) {
  // Socket is alive AND recorder is paused — safe to resume
  mediaRecorderRef.current.resume();
  isRecordingRef.current = true;
  setStatus('listening');
} else if (mediaRecorderRef.current?.state === 'paused') {
  // Recorder is paused BUT socket is dead — stop recorder and do full reconnect
  console.warn('[Voice] resumeListening: socket dead while recorder paused — doing full reconnect');
  emitDiagnostic('zombie-state-detected', 'recorder-paused-socket-dead');
  try {
    mediaRecorderRef.current.ondataavailable = null;
    mediaRecorderRef.current.stop();
  } catch (e) {
    // Ignore — just cleaning up stale recorder
  }
  mediaRecorderRef.current = null;
  isRecordingRef.current = false;
  startListening();
} else if (!mediaRecorderRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
  setupMediaRecorder();
  setStatus('listening');
} else if (!isConnectedRef.current) {
  startListening();
}
```

**Step 3: Verify**

```bash
grep -n "zombie-state-detected\|socket dead while recorder" src/hooks/useVoice.ts
```
Expected: One log line and one emitDiagnostic call.

**Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: No TypeScript errors.

**Step 5: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "Fix: resumeListening() checks socket liveness before resuming MediaRecorder — eliminates zombie state"
```

---

## Task 8: Fix 1 — Proactive Token Refresh: Wait for Safe Status

**Files:**
- Modify: `src/hooks/useVoice.ts` ~lines 626-640 (inside socket.onopen)

**Context:** This is the primary regression fix. The proactive token refresh fires at ~7.5 min regardless of current status. If Davy is mid-TTS (`'speaking'`) when it fires, `socket.onclose` does not trigger a reconnect (speaking is excluded from reconnect conditions). `resumeListening()` then runs after TTS and finds a dead socket — but Fix 7 (Task 7) now handles that. This fix additionally prevents the disruption by only firing the refresh when it's safe: status is `'listening'`, `'paused'`, or `'muted'` (between commands).

The implementation: replace the immediate setTimeout with a helper function that checks status and polls every 3s if not yet safe.

**Step 1: Read the current proactive refresh block carefully**

Find the comment `// Proactive token refresh:` inside `socket.onopen`. It looks like:
```typescript
// Proactive token refresh: schedule a controlled reconnect 90s before token expires.
// Prevents Deepgram from force-closing mid-utterance and avoids abrupt acoustic adaptation loss.
if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
const msUntilRefresh = tokenExpiryRef.current - Date.now() - 90000;
if (msUntilRefresh > 0) {
  tokenRefreshTimerRef.current = setTimeout(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN && shouldReconnectRef.current) {
      console.log('[Voice] Proactive token refresh: closing socket for fresh token');
      emitDiagnostic('token-refresh', 'proactive');
      tokenExpiryRef.current = 0; // Force ensureToken to fetch fresh token on next connect
      reconnectAttemptsRef.current = 0; // Reset counter — proactive refresh is not a failure
      socketRef.current.close(1000, 'Token refresh');
    }
  }, msUntilRefresh);
}
```

**Step 2: Replace with safe-status polling**

Replace the ENTIRE block above with:
```typescript
// Proactive token refresh: close and reconnect 90s before token expires.
// Only fires when status is safe (between commands) to avoid disrupting active operations.
if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
const msUntilRefresh = tokenExpiryRef.current - Date.now() - 90000;
if (msUntilRefresh > 0) {
  const SAFE_STATUSES = ['listening', 'paused', 'muted'];
  const attemptTokenRefresh = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !shouldReconnectRef.current) {
      return; // Socket already closed or stopped — nothing to do
    }
    if (SAFE_STATUSES.includes(statusRef.current)) {
      // Safe to refresh now (user is between commands)
      console.log('[Voice] Proactive token refresh: closing socket for fresh token (status:', statusRef.current, ')');
      emitDiagnostic('token-refresh', 'proactive');
      tokenExpiryRef.current = 0; // Force ensureToken to fetch fresh token on next connect
      reconnectAttemptsRef.current = 0; // Reset counter — proactive refresh is not a failure
      socketRef.current.close(1000, 'Token refresh');
    } else {
      // Not safe yet (speaking/thinking) — poll again in 3s
      console.log('[Voice] Proactive token refresh deferred (status:', statusRef.current, ') — retrying in 3s');
      tokenRefreshTimerRef.current = setTimeout(attemptTokenRefresh, 3000);
    }
  };
  tokenRefreshTimerRef.current = setTimeout(attemptTokenRefresh, msUntilRefresh);
}
```

**Step 3: Verify**

```bash
grep -n "Proactive token refresh deferred\|Safe to refresh now\|attemptTokenRefresh" src/hooks/useVoice.ts
```
Expected: Several lines referencing the new function.

**Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: No TypeScript errors.

**Step 5: Manual test — critical**

This is the hardest to test manually since it fires at 7.5 minutes. Verify logic is correct by reading the code once more:
- Socket opens → timer set for ~7.5 min
- Timer fires → checks status
- If `'listening'` → closes socket → socket.onclose fires → reconnect triggers (conditions include 'listening' ✅)
- If `'speaking'`/`'thinking'` → schedules retry in 3s → eventually fires when Davy is between commands ✅

**Step 6: Commit**

```bash
git add src/hooks/useVoice.ts
git commit -m "Fix: proactive token refresh waits for safe status before firing — eliminates zombie state on 7.5min boundary"
```

---

## Task 9: Full Build + Push

**Step 1: Clean build**

```bash
npm run build
```
Expected: Build succeeds with no errors. Warnings are OK.

**Step 2: Run existing tests**

```bash
npm test 2>&1 | tail -30
```
Expected: All tests pass (commandRecognizer unit tests).

**Step 3: Final diff review**

```bash
git diff HEAD~8 HEAD -- src/hooks/useVoice.ts | grep "^[+-]" | grep -v "^[+-][+-][+-]" | head -80
```
Review the combined diff. Verify:
- ✅ ECHO_COOLDOWN_MS = 300
- ✅ Both fetch(TTS_URL) calls have AbortSignal.timeout(15000)
- ✅ fetch(DEEPGRAM_TOKEN_URL) has AbortSignal.timeout(10000)
- ✅ AudioContext is reused (no close+recreate)
- ✅ 'thinking' added to reconnect conditions
- ✅ Max reconnect handler has 30s recovery timer
- ✅ resumeListening() has socket liveness check
- ✅ Proactive refresh has safe-status polling

**Step 4: Push to deploy**

```bash
git push origin main
```

Cloudflare Pages auto-deploys within 2-3 minutes. Verify deployment at https://my-stocker-ai.com.

**Step 5: Production smoke test**

1. Start a picking session
2. Say "next" immediately after ready beep → recognized ✅
3. Let session run for 10+ minutes without speaking → say "next" → recognized ✅
4. Complete at least one full machine → transitions work ✅

---

## What NOT to Touch

These files/changes from d9a06dd/4c7acb6 must be preserved:

| Thing to preserve | Where |
|-------------------|-------|
| `mediaRecorderRef.current.ondataavailable = null` before stop | `setupMediaRecorder()` |
| Stop old MediaRecorder before creating new | `setupMediaRecorder()` |
| skip_machine route_complete flags | `useStockerSession.ts` (DO NOT TOUCH THIS FILE) |
| Phonetic phrase corrections | `commandRecognizer.ts` (DO NOT TOUCH THIS FILE) |
| `speakBrowser()` 15s timeout | `useVoice.ts` speakBrowser() function |
| `acquireSpeakLock()` 20s timeout | `useVoice.ts` acquireSpeakLock() function |
| catch/finally block structure in `speak()` | `useVoice.ts` speak() |

---

## Rollback

If anything breaks:
```bash
git revert HEAD~<n>  # revert specific commit
git push origin main
```

Or to revert all 9 fixes at once:
```bash
git revert HEAD~8..HEAD --no-commit
git commit -m "Revert: voice reliability fixes (emergency rollback)"
git push origin main
```
