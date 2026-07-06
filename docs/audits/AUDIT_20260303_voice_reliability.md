# System Impact Audit: Voice Reliability Overhaul

**Date:** 2026-03-03
**Change:** 9-fix voice reliability overhaul — eliminate zombie states, reconnect failures, command drops
**Files in scope:** `src/hooks/useVoice.ts` (primary), `src/pages/StockerApp.tsx` (unmodified, impact-checked)
**Audit status:** COMPLETE — approved to proceed

---

## 1. DATA FLOW

### What data enters/exits useVoice.ts?

**Inputs:**
- Microphone audio → MediaRecorder → WebSocket chunks → Deepgram
- Deepgram WebSocket messages (Results, UtteranceEnd) → transcript text → onTranscript callback
- TTS text → fetch(TTS_URL) → AudioBlob → HTMLAudio / WebAudio playback

**Outputs:**
- `status` (VoiceStatus) — consumed by StockerApp.tsx for UI state
- `lastInput` — displayed in UI as interim transcript
- `isDeepgramConnected` — diagnostic indicator
- `onTranscript(text, isFinal)` callback → handleTranscript() in StockerApp.tsx
- `onError(message)` callback → error display in StockerApp.tsx

**Format changes from these 9 fixes:** None. All inputs/outputs remain identical. This is purely internal behavior change.

---

## 2. CALLERS (Upstream)

### Who calls into useVoice.ts?

| Caller | What it calls | Impact of changes |
|--------|--------------|-------------------|
| `StockerApp.tsx` | `startListening()`, `stopListening()`, `speak()`, `pauseListening()`, `resumeListening()`, `setThinking()` | No interface changes — all function signatures unchanged |
| `StockerApp.tsx` | Reads `status`, `lastInput`, `isDeepgramConnected` | No change to what's exported |
| Event system | `speak()` called from `handleTranscript` via `v.speak()` | Fix 4/9 (TTS timeout) changes behavior: hangs become AbortErrors → fallback to speakBrowser(). StockerApp.tsx already handles speak() failures (see finally block in handleTranscript). ✅ |
| Event system | `resumeListening()` called after speak() | Fix 2 changes behavior: may now trigger full reconnect instead of just MediaRecorder.resume(). This is transparent to callers — same end state (voice listening). ✅ |

**Assessment:** No callers require changes. All 9 fixes are internal to useVoice.ts.

---

## 3. CALLEES (Downstream)

### What does useVoice.ts call?

| Callee | Called By | Impact |
|--------|-----------|--------|
| `fetch(DEEPGRAM_TOKEN_URL)` | `ensureToken()` | Fix 5: adds `AbortSignal.timeout(10000)`. If token fetch times out, `connectDeepgram()` throws → reconnect attempt fails → counted as failure → exponential backoff → eventually fix 6 recovery kicks in. No new code paths created. |
| `fetch(TTS_URL)` | `speak()`, `prefetchTTS()` | Fix 4/9: adds `AbortSignal.timeout(15000)`. AbortError thrown → caught by existing try/catch in speak() → falls back to `speakBrowser()`. processingRef released in finally block. ✅ |
| `WebSocket` (Deepgram) | `connectDeepgram()` | Fix 1: proactive refresh now polls for safe status before closing. Same close mechanism (`socket.close(1000)`). Same downstream effect. |
| `startListening()` | `resumeListening()` (new) | Fix 2: resumeListening() may now call startListening() when socket is dead. startListening() is already called in this path (branch c at line 974). No new code path — just moved the existing fallthrough condition to be explicit. ✅ |
| `connectDeepgram()` | Recovery timer (new, fix 6) | Fix 6: After 30s, calls `startListening()` directly to attempt recovery from error state. startListening() resets shouldReconnectRef, isConnectedRef, reconnectAttemptsRef before connecting. ✅ |
| `AudioContext` | `speak()` iOS/Desktop path | Fix 8: Stops closing/recreating AudioContext on every speak(). Reuses existing context. getAudioContext() already handles suspended state. If context is in 'closed' state, a new one is created (existing logic). ✅ |

---

## 4. SIDE EFFECTS

| Fix | Side Effect | Assessment |
|-----|-------------|------------|
| Fix 1 (proactive refresh waits for safe status) | Socket closes 3-90s later than before (waits for 'listening') | Intent unchanged — socket still refreshes before token expires. Gap occurs during command-free window. ✅ |
| Fix 2 (resumeListening socket check) | May trigger full Deepgram reconnect after TTS if socket died | Adds ~1-2s reconnect time in failure cases. Better than zombie state. ✅ |
| Fix 3 (thinking in reconnect conditions) | Reconnect starts in background during API call processing | Reconnect (1s backoff) completes before API response + TTS (typically 2-5s). No conflict. ✅ |
| Fix 4/9 (TTS timeout) | TTS falls back to browser TTS after 15s | Browser TTS is lower quality but functional. User hears response, system recovers. ✅ |
| Fix 5 (token timeout) | Reconnect fails fast (10s) instead of hanging | Counted as reconnect failure, exponential backoff continues. Fix 6 provides eventual recovery. ✅ |
| Fix 6 (recovery after max retries) | System keeps trying to reconnect every 30s | For permanent failures (Deepgram down), this retries indefinitely. Acceptable for 3-hour session use case. Could add user-visible indicator. ✅ |
| Fix 7 (echo cooldown 300ms) | Real echo has smaller filtering window | Risk: echo from phone speaker might get through. Mitigation: text similarity check (line 121-126) still catches exact echoes. Commands are short ("next", "bottom") — unlikely to match long item description spoken by TTS. Low risk. ✅ |
| Fix 8 (AudioContext reuse) | Context state carries over between TTS plays | Health monitor (existing, lines 1452-1481) checks every 10s for suspended context and auto-resumes. Context recreated if 'closed'. ✅ |

---

## 5. STATE DEPENDENCIES

### Race conditions and state conflicts analyzed:

**Fix 1 + Fix 3 interaction:**
- Proactive refresh fires while status='thinking' → polls every 3s → status becomes 'listening' (after API response + speak()) → refresh fires
- Reconnect from fix 3 also fires during 'thinking' if socket drops
- These two paths don't conflict: refresh timer only fires if socket is still OPEN; if socket already closed (triggering fix 3 reconnect), the refresh timer callback checks `socketRef.current?.readyState === WebSocket.OPEN` → false → no-op. ✅

**Fix 2 + Fix 3 interaction (analyzed above in section 3):**
- Socket closes during 'thinking' → fix 3 reconnect starts (1s backoff)
- API response arrives → speak() called → pauseListening() pauses new MediaRecorder
- TTS ends → resumeListening() → MediaRecorder is paused, socket is OPEN (reconnect completed) → normal resume path. ✅
- If reconnect hasn't completed: socket not OPEN → fix 2 calls startListening() → full reconnect. ✅

**Fix 6 (recovery timer) + existing reconnect logic:**
- Recovery timer calls startListening() directly
- startListening() resets stoppedRef, shouldReconnectRef, isConnectedRef, reconnectAttemptsRef to clean state before connecting
- Safe to call even if in 'error' state. ✅

**Fix 7 (echo cooldown) + interim transcript display:**
- Interim results shown during 200ms silence timer period
- Reducing echo cooldown doesn't affect interim display (separate path). ✅

**Fix 8 (AudioContext reuse) + health monitor:**
- Health monitor (every 10s) checks for suspended AudioContext
- If context becomes suspended between speak() calls, health monitor resumes it
- speak() checks state before use via getAudioContext() which also calls resume() if suspended. ✅

---

## 6. ERROR PROPAGATION

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| TTS fetch hangs | processingRef locked forever, voice deaf | AbortError after 15s → speakBrowser() → processingRef released → voice resumes |
| Token fetch hangs on reconnect | Reconnect hangs forever, stuck | AbortError after 10s → reconnect attempt counted → backoff → fix 6 recovery |
| Socket dies during TTS | resumeListening() resumes to dead socket → zombie state | Fix 2: detects dead socket → startListening() → reconnect |
| Socket dies during 'thinking' | No reconnect triggered → zombie state after speak | Fix 3: reconnect triggered → completes before TTS ends |
| 5 consecutive reconnect failures | Permanent 'error' state, must refresh | Fix 6: 30s wait, reset counter, try again |
| Proactive refresh fires during speak | Socket closes, reconnect blocked ('speaking' not in conditions) | Fix 1: refresh only fires during 'listening'/'paused'/'muted' — not during speaking |

---

## REQUIRED ADDITIONAL CHANGES

None beyond the 9 fixes. All changes are contained within `src/hooks/useVoice.ts`.

**Files NOT requiring changes:**
- `src/pages/StockerApp.tsx` — no interface changes
- `src/utils/commandRecognizer.ts` — unchanged
- `src/hooks/useStockerSession.ts` — unchanged
- Python API — unchanged
- Database — unchanged
- n8n workflows — unchanged (not used)

---

## TESTING PLAN

1. **Zombie state test:** Let session run 8+ minutes without speaking. Say "next" — should respond.
2. **Mid-TTS socket drop:** Simulate by throttling network during TTS. Command after should work.
3. **Fast command test:** Say "next" immediately after ready beep. Should NOT be filtered.
4. **Token refresh test:** Run session past 9 minutes, verify reconnect is transparent.
5. **Max retry recovery test:** Block network for 30+ seconds, verify system recovers when restored.
6. **Long session test (3 hours):** Davy's actual route — verify no degradation over time.

---

## ROLLBACK PLAN

All changes are in `src/hooks/useVoice.ts`. Git revert to `4c7acb6` restores previous behavior.

```bash
git revert HEAD  # or specific commit
git push origin main
```

---

## RISK ASSESSMENT

**Overall risk: LOW**
- All changes internal to one file
- No data model changes
- No API contract changes
- No backend changes
- Fixes are additive or subtractive (no structural refactors)
- All failure modes fall back to existing behavior or existing fallbacks

**Highest risk fix:** Fix 7 (echo cooldown 300ms) — could allow a real echo through on phone speaker. Mitigation: text similarity check still active. Can be tuned if needed.

**Approval status:** APPROVED — proceed to design doc and implementation plan
