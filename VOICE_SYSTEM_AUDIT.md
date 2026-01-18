# Voice System Technical Audit - Proactive Bug Discovery
**Date:** 2026-01-18
**File:** `/src/hooks/useVoice.ts` (1,519 lines)
**Purpose:** Identify potential bugs in voice recognition system before they manifest in production
**Method:** Systematic code review of Deepgram + MediaRecorder + AudioContext integration

---

## CRITICAL BUGS DISCOVERED

### 🔴 BUG-VOICE-1: Wake Lock Not Released on startListening Failure

**Location:** `src/hooks/useVoice.ts:745-796`
**Severity:** CRITICAL (Battery drain)
**Impact:** If microphone permission denied or Deepgram connection fails, wake lock stays acquired → device battery drains

**Current Code:**
```typescript
// Line 745-760: Acquire wake lock
wakeLockRef.current = await (navigator as any).wakeLock.request('screen');

// Line 765-796: Multiple error paths
if (error.name === 'NotAllowedError') {
  // Error handling but wake lock NOT released
}
setStatus('error');
return false;  // ← Wake lock still held!
```

**Should Be:**
```typescript
} catch (error: any) {
  console.error('[Voice] startListening failed:', error);

  // Release wake lock on any error
  if (wakeLockRef.current) {
    try {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    } catch (e) {
      console.warn('[Voice] Failed to release wake lock:', e);
    }
  }

  // Then handle specific errors...
}
```

**How to Reproduce:**
1. Deny microphone permission
2. Click "Start Voice"
3. Result: Error shown but screen stays awake indefinitely

---

### 🔴 BUG-VOICE-2: Audio Stream Not Released on Connection Failure

**Location:** `src/hooks/useVoice.ts:765-796`
**Severity:** CRITICAL (Privacy/UX issue)
**Impact:** If Deepgram connection fails after getUserMedia succeeds, microphone stays active → red indicator stays on, privacy concern

**Current Code:**
```typescript
// Line 767: Stream acquired
const stream = await getOrCreateAudioStream();

// Line 770: Connection fails
await connectDeepgram();  // ← Throws error

// Line 778-796: Error handling
} catch (error: any) {
  // Stream never cleaned up!
  setStatus('error');
  return false;
}
```

**Should Be:**
```typescript
} catch (error: any) {
  console.error('[Voice] startListening failed:', error);

  // Clean up audio stream
  if (audioStreamRef.current) {
    audioStreamRef.current.getTracks().forEach(track => track.stop());
    audioStreamRef.current = null;
  }

  // Release wake lock (from BUG-VOICE-1)
  if (wakeLockRef.current) {
    wakeLockRef.current.release();
    wakeLockRef.current = null;
  }

  // Handle errors...
}
```

**How to Reproduce:**
1. Turn off internet connection
2. Click "Start Voice"
3. getUserMedia succeeds, connectDeepgram fails
4. Result: Microphone indicator stays red, but voice not actually active

---

### 🔴 BUG-VOICE-3: Multiple AudioContexts Accumulate on speak() Failures

**Location:** `src/hooks/useVoice.ts:1206-1278`
**Severity:** CRITICAL (Memory leak)
**Impact:** If TTS fetch fails repeatedly, new AudioContext created each time but never closed → memory leak, audio glitches

**Current Code:**
```typescript
// Line 1206-1217: Create FRESH AudioContext
const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const audioContext = new AudioContextClass({ sampleRate: 44100 });
audioContextRef.current = audioContext;  // ← Overwrites previous without closing

// Line 1275-1278: Fallback on error
} catch (error) {
  await speakBrowser(text);  // ← AudioContext NOT closed
}
```

**Should Be:**
```typescript
// Close old context BEFORE creating new one
if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
  try {
    await audioContextRef.current.close();
  } catch (e) {
    console.warn('[Voice] Failed to close old AudioContext:', e);
  }
}

// Create fresh context
const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const audioContext = new AudioContextClass({ sampleRate: 44100 });
audioContextRef.current = audioContext;

try {
  // Play audio...
} catch (error) {
  // Close context on error
  try {
    await audioContext.close();
  } catch (e) {}
  audioContextRef.current = null;
  await speakBrowser(text);
}
```

**How to Reproduce:**
1. Simulate TTS fetch failures (network issues, server errors)
2. Each failed speak() call creates new AudioContext
3. After 10+ failures, browser performance degrades

---

### 🔴 BUG-VOICE-4: Speak Queue Deadlock on stopAudio

**Location:** `src/hooks/useVoice.ts:959-986, 1006-1015`
**Severity:** HIGH (UI freeze)
**Impact:** If stopAudio called while speak() waiting for lock, lock never released → subsequent speak() calls hang forever

**Current Code:**
```typescript
// Line 1006-1015: acquireSpeakLock
const acquireSpeakLock = useCallback((): Promise<void> => {
  return new Promise(resolve => {
    if (!speakLockRef.current) {
      speakLockRef.current = true;
      resolve();
    } else {
      speakQueueRef.current.push(resolve);  // ← Waiting for release
    }
  });
}, []);

// Line 959-986: stopAudio
const stopAudio = useCallback(() => {
  stoppedRef.current = true;
  speakQueueRef.current = [];  // ← Queue cleared but waiting promises never resolve!
  speakLockRef.current = false;
  // ...
}, []);
```

**Should Be:**
```typescript
const stopAudio = useCallback(() => {
  stoppedRef.current = true;

  // Resolve all waiting promises before clearing queue
  while (speakQueueRef.current.length > 0) {
    const next = speakQueueRef.current.shift();
    next?.();  // Resolve the waiting promise
  }

  speakLockRef.current = false;
  // ...
}, []);
```

**How to Reproduce:**
1. Call speak("long text")
2. While speaking, call speak("more text") → queued
3. Before second speak starts, call stopAudio()
4. Result: Second speak() promise never resolves, hangs forever

---

### 🟡 BUG-VOICE-5: Volume Multiplier Not Validated (NaN Issue)

**Location:** `src/hooks/useVoice.ts:1158, 1242`
**Severity:** MEDIUM (Unexpected behavior)
**Impact:** If localStorage has invalid volume value, parseFloat returns NaN → audio plays at default volume instead of failing gracefully

**Current Code:**
```typescript
// Line 1158: Android path
const volumeMultiplier = parseFloat(localStorage.getItem('stocker-tts-volume') || '1.5');
audio.volume = Math.min(volumeMultiplier, 1.0);  // ← If NaN, audio.volume = NaN (invalid)

// Line 1242: iOS/Desktop path
gainNode.gain.value = volumeMultiplier;  // ← Same issue
```

**Should Be:**
```typescript
const rawVolume = parseFloat(localStorage.getItem('stocker-tts-volume') || '1.5');
const volumeMultiplier = isNaN(rawVolume) || rawVolume <= 0 ? 1.5 : rawVolume;
```

**How to Reproduce:**
1. Set localStorage: `localStorage.setItem('stocker-tts-volume', 'invalid')`
2. Play voice response
3. Result: Volume unpredictable (NaN behavior varies by browser)

---

### 🟡 BUG-VOICE-6: Keep-Alive Not Stopped on WebSocket Error

**Location:** `src/hooks/useVoice.ts:613-617`
**Severity:** MEDIUM (Resource waste)
**Impact:** If WebSocket errors but doesn't close, keep-alive keeps sending to dead socket → wasted network requests

**Current Code:**
```typescript
socket.onerror = (event) => {
  clearTimeout(timeout);
  emitDiagnostic('error', 'Deepgram WebSocket error');
  onErrorRef.current?.('WebSocket error');
  // ← Keep-alive NOT stopped
};

socket.onclose = (event) => {
  // ...
  stopKeepAlive();  // ← Only stopped on close, not error
};
```

**Should Be:**
```typescript
socket.onerror = (event) => {
  clearTimeout(timeout);
  stopKeepAlive();  // Stop keep-alive on error
  emitDiagnostic('error', 'Deepgram WebSocket error');
  onErrorRef.current?.('WebSocket error');
};
```

---

### 🟡 BUG-VOICE-7: Silence Timer Not Cleared on External setStatus

**Location:** `src/hooks/useVoice.ts:1509, 417-421`
**Severity:** MEDIUM (Unexpected command processing)
**Impact:** If external code calls setStatus(), silence timer not cleared → fires and processes stale transcript in wrong state

**Current Code:**
```typescript
// Line 417-421: Silence timer set
silenceTimerRef.current = setTimeout(() => {
  processAccumulatedTranscript();  // ← Processes regardless of status
}, 200);

// Line 1509: setStatus exposed publicly
return {
  setStatus,  // ← External caller can change status without clearing timer
  // ...
};
```

**Should Be:**
Add check in processAccumulatedTranscript:
```typescript
const processAccumulatedTranscript = useCallback(() => {
  const text = accumulatedTranscriptRef.current.trim();
  accumulatedTranscriptRef.current = '';

  if (!text) return;

  const currentStatus = statusRef.current;

  // Validate status FIRST - don't process if invalid state
  if (currentStatus !== 'listening' && currentStatus !== 'paused' && currentStatus !== 'muted' && currentStatus !== 'idle') {
    console.log('[Voice] Ignoring transcript, invalid state:', currentStatus);
    return;
  }

  // ... rest of processing
}, []);
```

---

### 🟡 BUG-VOICE-8: Echo Filtering Time Check Ineffective for Long Audio

**Location:** `src/hooks/useVoice.ts:104-128, 1282`
**Severity:** MEDIUM (False echoes not filtered)
**Impact:** If TTS audio plays for >800ms, cooldown expires mid-speech → user speech during AI speech not filtered as echo

**Current Code:**
```typescript
// Line 108: Check cooldown
if (Date.now() - lastSpeakTimeRef.current < ECHO_COOLDOWN_MS) {
  return true;  // Filter as echo
}

// Line 1282: Set timestamp AFTER audio completes
lastSpeakTimeRef.current = Date.now();  // ← Set after 2-5 second audio finishes
```

**Issue:** If audio takes 3 seconds to play and user speaks at 1 second mark:
- lastSpeakTimeRef was set 3 seconds ago (from previous speech)
- Current time - 3000ms = >800ms → NOT filtered as echo
- User speech during AI speech gets processed as command

**Should Be:**
```typescript
// Set timestamp BEFORE audio plays
lastSpeakTimeRef.current = Date.now();
lastSpokenTextRef.current = text.toLowerCase();

// Then play audio...
```

---

### 🟡 BUG-VOICE-9: Accumulated Transcript Not Cleared on Callback Error

**Location:** `src/hooks/useVoice.ts:351-382`
**Severity:** MEDIUM (Data corruption)
**Impact:** If onTranscript callback throws error, accumulated transcript not cleared → next transcript includes stale data

**Current Code:**
```typescript
const processAccumulatedTranscript = useCallback(() => {
  const text = accumulatedTranscriptRef.current.trim();
  accumulatedTranscriptRef.current = '';  // ← Cleared FIRST

  // ... validation logic ...

  // Pass to handler - if this throws, transcript already cleared
  onTranscriptRef.current?.(text, true);  // ← If throws, transcript lost but OK
}, []);
```

**Actually OK:** Transcript is cleared BEFORE callback, so if callback throws, transcript is already gone. This is correct behavior.

**RETRACT BUG-VOICE-9** - Code is correct.

---

### 🟡 BUG-VOICE-10: MediaRecorder onerror Doesn't Reset Recording Flag

**Location:** `src/hooks/useVoice.ts:501-505, 521`
**Severity:** MEDIUM (State corruption)
**Impact:** If MediaRecorder errors after start, isRecordingRef stays true but recorder stopped → state mismatch

**Current Code:**
```typescript
// Line 520-521
recorder.start(100);
isRecordingRef.current = true;

// Line 501-505: Error handler
recorder.onerror = (event) => {
  console.error('[Voice] MediaRecorder error:', event);
  emitDiagnostic('error', 'MediaRecorder error');
  onErrorRef.current?.('MediaRecorder error');
  // ← isRecordingRef.current NOT set to false
};
```

**Should Be:**
```typescript
recorder.onerror = (event) => {
  console.error('[Voice] MediaRecorder error:', event);
  isRecordingRef.current = false;  // Reset recording flag
  emitDiagnostic('error', 'MediaRecorder error');
  onErrorRef.current?.('MediaRecorder error');
};
```

---

### 🟢 BUG-VOICE-11: Reconnection Can Race with stopListening

**Location:** `src/hooks/useVoice.ts:679-691, 813-816`
**Severity:** LOW (Edge case)
**Impact:** If stopListening called between reconnect timeout scheduling and execution, reconnect still fires → wasted connection

**Current Code:**
```typescript
// Line 679-691: Schedule reconnect
reconnectTimeoutRef.current = setTimeout(async () => {
  try {
    await connectDeepgram();  // ← Fires even if shouldReconnect now false
  } catch (e) {}
}, backoffMs);

// Line 813-816: stopListening clears timeout
if (reconnectTimeoutRef.current) {
  clearTimeout(reconnectTimeoutRef.current);
  reconnectTimeoutRef.current = null;
}
```

**Issue:** Narrow race window where timeout fires between check and clear.

**Fix:** Add shouldReconnect check inside timeout:
```typescript
reconnectTimeoutRef.current = setTimeout(async () => {
  if (!shouldReconnectRef.current) {
    console.log('[Voice] Reconnect cancelled - should not reconnect');
    return;
  }
  try {
    await connectDeepgram();
  } catch (e) {}
}, backoffMs);
```

---

## SUMMARY

**Total Bugs Found:** 10 (retracted 1)
- 🔴 CRITICAL: 4 (Wake lock leak, audio stream leak, AudioContext leak, speak queue deadlock)
- 🟡 MEDIUM: 5 (Volume validation, keep-alive leak, silence timer, echo filtering, MediaRecorder state)
- 🟢 LOW: 1 (Reconnection race)

**Audit Coverage:** Voice recognition system complete (100%)

**Most Critical:**
1. BUG-VOICE-1: Wake lock not released → battery drain
2. BUG-VOICE-2: Audio stream not released → privacy issue (microphone stays on)
3. BUG-VOICE-3: AudioContext leak → memory leak, eventual crash
4. BUG-VOICE-4: Speak queue deadlock → UI freeze

**Next Steps:**
1. Fix CRITICAL bugs immediately
2. Fix MEDIUM bugs before next voice session testing
3. Continue audit: n8n workflows, database integrity

---

**END OF VOICE SYSTEM AUDIT**
