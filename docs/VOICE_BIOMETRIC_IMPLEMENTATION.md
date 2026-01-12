# Voice Biometric Implementation Plan
**Created:** 2026-01-12 (Session 35)
**Status:** Design Phase → Ready for Implementation
**Complexity:** MEDIUM (not super complex!)

---

## What You're Asking For (In Plain English)

**User's Question:** "Would it be feasible to create a data point of the wave profile of a user's voice? A digital voice footprint that while that user is logged in, the system will only read that voice?"

**Answer:** **YES! This is called a "voiceprint" or "speaker embedding" and it's totally doable.**

---

## How It Works (Simple Explanation)

### The Concept
1. **Enrollment:** User records their voice saying a few keywords (10-15 samples)
2. **Extract Voiceprint:** AI analyzes voice characteristics (pitch, tone, cadence, accent)
3. **Store Voiceprint:** Save as a 512-number "fingerprint" in database
4. **Verification:** Every time someone speaks, compare their voice to stored voiceprint
5. **Match/Reject:** If voices match (>85% similarity), activate. Otherwise, ignore.

### The Magic
- **Voiceprint** = 512 numbers representing voice characteristics
- Works even if user says different words
- Immune to recordings (liveness detection available)
- Works across devices (not device-specific)
- Not affected by background noise (extracts speaker features)

---

## Technical Architecture

### Option 1: Deepgram Speaker Diarization (RECOMMENDED)
**Pros:**
- Already using Deepgram for STT
- Real-time speaker identification
- No additional signup needed

**Cons:**
- Pricing unclear (need to contact sales)
- Limited documentation

**API Example:**
```javascript
// Enrollment: Extract speaker embedding
const response = await fetch('https://api.deepgram.com/v1/listen', {
  method: 'POST',
  headers: {
    'Authorization': `Token ${DEEPGRAM_API_KEY}`,
    'Content-Type': 'audio/wav'
  },
  body: audioBlob,
  query: {
    model: 'nova-2',
    diarize: true,
    diarize_version: '2023-09-07'
  }
});

// Response includes speaker embeddings
const { diarization } = await response.json();
const speakerEmbedding = diarization.speakers[0].embedding; // 512-dim vector
```

---

### Option 2: Azure Cognitive Services Speaker Recognition (PRODUCTION-READY)
**Pros:**
- Enterprise-grade, battle-tested
- Clear pricing: $1/hour audio processed
- Excellent documentation
- Liveness detection built-in

**Cons:**
- Additional service to integrate
- Slightly higher cost

**API Example:**
```javascript
// Enrollment
const enrollmentResponse = await fetch(
  `https://[region].api.cognitive.microsoft.com/speaker/verification/v2.0/text-independent/profiles/${profileId}/enrollments`,
  {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type': 'audio/wav'
    },
    body: audioBlob
  }
);

// Verification
const verifyResponse = await fetch(
  `https://[region].api.cognitive.microsoft.com/speaker/verification/v2.0/text-independent/profiles/${profileId}/verify`,
  {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type': 'audio/wav'
    },
    body: liveAudioBlob
  }
);

const { recognitionResult, score } = await verifyResponse.json();
// score = 0.0 to 1.0 (0.85+ = match)
```

---

### Option 3: SpeechBrain (OPEN-SOURCE, FREE)
**Pros:**
- Completely free
- Self-hosted (full control)
- No API limits
- Privacy-friendly (data never leaves your server)

**Cons:**
- Requires hosting (Docker container)
- More setup complexity
- Need to manage infrastructure

**Implementation:**
```python
# Self-hosted Python server using SpeechBrain
from speechbrain.pretrained import SpeakerRecognition

model = SpeakerRecognition.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir="pretrained_models/spkrec-ecapa-voxceleb"
)

# Enrollment
enrollment_embedding = model.encode_batch("user_audio.wav")
# Save to database

# Verification
live_embedding = model.encode_batch("live_audio.wav")
similarity = cosine_similarity(enrollment_embedding, live_embedding)

if similarity > 0.85:
    print("Match! Activate system.")
else:
    print("No match. Ignore command.")
```

---

## Database Schema Changes

### Add to `profiles` table:
```sql
ALTER TABLE public.profiles
ADD COLUMN voiceprint_enrolled BOOLEAN DEFAULT FALSE,
ADD COLUMN voiceprint_embedding FLOAT8[] NULL, -- 512-dim vector (for SpeechBrain)
ADD COLUMN voiceprint_profile_id TEXT NULL,     -- Azure/Deepgram profile ID
ADD COLUMN voiceprint_enrolled_at TIMESTAMPTZ NULL,
ADD COLUMN voiceprint_samples_count INTEGER DEFAULT 0,
ADD COLUMN personal_wake_word TEXT DEFAULT 'Hey Stocker';

-- Index for fast lookups
CREATE INDEX idx_profiles_voiceprint_enrolled ON public.profiles(voiceprint_enrolled);
```

---

## Enrollment Flow (User Experience)

### First-Time Setup (5-10 minutes)

**Step 1: Navigate to Settings**
- User taps "Settings" icon in StockerApp
- New section: "Voice Recognition Settings"

**Step 2: Start Enrollment**
- Button: "Set Up Voice Recognition"
- Explanation: "We'll record your voice to ensure only you can control this device."

**Step 3: Record Samples**
- User speaks 10-15 phrases:
  1. "Hey Stocker" (3 times)
  2. "Next item" (2 times)
  3. "Skip machine" (2 times)
  4. "Repeat" (2 times)
  5. "Top" (1 time)
  6. "Bottom" (1 time)
  7. "Complete route" (1 time)

**Visual Feedback:**
```
Recording Sample 1 of 12...
"Hey Stocker"

[==========>          ] 45%

Speak now...
```

**Step 4: Process & Save**
- Extract voiceprint from all samples
- Average embeddings for robustness
- Store in database
- Show success message: "Voice recognition set up! Only your voice will activate commands."

**Step 5: Test**
- Immediate test: "Say 'Next item'"
- Verify voiceprint works
- If fails, prompt to re-record

---

## Runtime Verification (Every Command)

### Current Flow (No Voiceprint):
```
User speaks → Deepgram STT → CommandRecognizer → Execute
```

### New Flow (With Voiceprint):
```
User speaks → Deepgram STT (with speaker embedding) →
  ↓
Speaker Verification (compare to stored voiceprint)
  ↓
If match (>0.85 similarity):
  → CommandRecognizer → Execute
Else:
  → Ignore (log "wrong speaker" event)
```

### Implementation (useVoice.ts):
```typescript
// After Deepgram returns transcript
const { transcript, speaker_embedding } = deepgramResult;

// Verify speaker
const voiceprintMatch = await verifyVoiceprint(
  speaker_embedding,
  user.voiceprint_embedding
);

if (voiceprintMatch.score < 0.85) {
  console.log('[Voice] Speaker verification failed:', voiceprintMatch.score);
  // Optionally play error beep
  voice.playErrorBeep();
  return; // Don't process command
}

// Continue with command processing
onTranscript(transcript);
```

---

## Personal Wake Word Integration

### Current: Single Wake Word
Everyone says: "Hey Stocker"

### New: Personalized Wake Word
- User 1: "Hey Stocker David"
- User 2: "Hey Stocker Sarah"
- User 3: "Hey Stocker Alpha"

### Storage:
```sql
UPDATE profiles
SET personal_wake_word = 'Hey Stocker David'
WHERE id = '[user-id]';
```

### Runtime:
```typescript
// On app load
const user = await supabase.auth.getUser();
const { data: profile } = await supabase
  .from('profiles')
  .select('personal_wake_word')
  .eq('id', user.id)
  .single();

// Pass to Deepgram
const wakeWord = profile.personal_wake_word || 'Hey Stocker';
deepgramConnection.send({
  type: 'Configure',
  keywords: [`${wakeWord}:1.5`] // Boost personal wake word
});
```

---

## Environmental Profiling (Garage vs Warehouse)

### Auto-Detection on Session Start

**Step 1: Capture Baseline Noise**
```typescript
async function captureNoiseBaseline() {
  console.log('[Voice] Capturing ambient noise baseline...');

  // Record 3 seconds of silence (user doesn't speak)
  const audioChunks = [];
  const recorder = new MediaRecorder(stream);

  recorder.ondataavailable = (e) => audioChunks.push(e.data);
  recorder.start();

  await new Promise(resolve => setTimeout(resolve, 3000));
  recorder.stop();

  // Analyze noise level
  const audioBlob = new Blob(audioChunks);
  const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());

  const rms = calculateRMS(audioBuffer); // Root Mean Square amplitude
  const dbLevel = 20 * Math.log10(rms);

  return dbLevel;
}
```

**Step 2: Classify Environment**
```typescript
function classifyEnvironment(dbLevel: number): 'quiet' | 'moderate' | 'loud' {
  if (dbLevel < 40) return 'quiet';      // Quiet room/garage
  if (dbLevel < 65) return 'moderate';   // Office, small warehouse
  return 'loud';                         // Large warehouse, factory
}
```

**Step 3: Auto-Adjust Settings**
```typescript
function applyEnvironmentSettings(env: string) {
  switch(env) {
    case 'quiet':
      // Sensitive detection (low VAD threshold)
      deepgramSettings.vad_threshold = 0.3;
      micGain = 1.0;
      break;

    case 'moderate':
      // Balanced
      deepgramSettings.vad_threshold = 0.5;
      micGain = 1.2;
      break;

    case 'loud':
      // Aggressive noise gate (high VAD threshold)
      deepgramSettings.vad_threshold = 0.7;
      micGain = 1.5;
      break;
  }

  console.log(`[Voice] Environment: ${env}, VAD: ${deepgramSettings.vad_threshold}`);
}
```

---

## Implementation Phases

### Phase 1: Voice Biometric Foundation (2-3 weeks)

**Week 1: Backend & Database**
- [ ] Add voiceprint columns to profiles table
- [ ] Create enrollment API endpoint (Supabase Edge Function)
- [ ] Integrate Azure Speaker Recognition API (or Deepgram)
- [ ] Create verification API endpoint

**Week 2: Frontend Enrollment UI**
- [ ] Add "Voice Recognition Settings" section to SettingsSheet
- [ ] Build enrollment flow (multi-step recording)
- [ ] Visual feedback during recording
- [ ] Test enrollment flow with 3-5 users

**Week 3: Runtime Verification**
- [ ] Integrate speaker verification into useVoice.ts
- [ ] Add voiceprint matching logic
- [ ] Test cross-talk prevention (3+ users)
- [ ] Measure verification latency (<200ms target)

---

### Phase 2: Personal Wake Words (1 week)

**Implementation:**
- [ ] Add wake word customization UI
- [ ] Store personal wake word in database
- [ ] Load on app start, pass to Deepgram
- [ ] Test unique wake word per user

---

### Phase 3: Environmental Profiling (1-2 weeks)

**Implementation:**
- [ ] Capture ambient noise baseline on session start
- [ ] Classify environment (quiet/moderate/loud)
- [ ] Auto-adjust VAD threshold and mic gain
- [ ] Test in garage, office, warehouse
- [ ] Measure accuracy delta across environments

---

## Cost Estimate

### Option 1: Azure Speaker Recognition
- **Setup:** $3-5k development
- **Ongoing:** $1/hour audio processed
  - Average session: 2 hours = $2/session
  - 100 sessions/month = $200/month
  - **Total Year 1:** $5k setup + $2.4k/year = **$7.4k**

### Option 2: Deepgram (Pricing TBD)
- **Setup:** $3-5k development
- **Ongoing:** Unknown (need quote from Deepgram)
  - Likely similar to Azure
  - **Estimate:** $5k setup + $2-3k/year = **$7-8k**

### Option 3: SpeechBrain (Open-Source)
- **Setup:** $8-12k development (more complex)
- **Hosting:** $50-100/month Docker container
- **Total Year 1:** $12k setup + $600-1200 hosting = **$12.6-13.2k**

**RECOMMENDATION:** Start with Azure (clearest pricing, best docs)

---

## Privacy & Security Considerations

### Data Storage
- **Voiceprints encrypted at rest** (Supabase built-in encryption)
- **Never store raw audio** (only embeddings/profile IDs)
- **User can delete voiceprint** (GDPR compliance)

### Consent
- **Explicit opt-in required** during enrollment
- **Clear explanation** of what's being recorded
- **Skip option** for users who don't want voiceprint

### Liveness Detection
- **Azure includes liveness** (detects recordings vs live voice)
- **Prevents spoofing** via playback attacks

---

## Testing Plan

### Enrollment Testing
- [ ] Test with 10+ diverse users (age, gender, accent)
- [ ] Measure enrollment time (target: <5 minutes)
- [ ] Test re-enrollment (update voiceprint)
- [ ] Test enrollment failure recovery

### Verification Testing
- [ ] Cross-talk test: 3 users, same room, all say "next"
  - Expected: Each device only responds to enrolled user
- [ ] False positive test: Play TV/radio with speech
  - Expected: <1% false activation rate
- [ ] False negative test: Enrolled user with cold/illness
  - Expected: >95% recognition rate
- [ ] Latency test: Measure verification time
  - Expected: <200ms added latency

### Environmental Testing
- [ ] Quiet garage: Measure accuracy
- [ ] Moderate office: Measure accuracy
- [ ] Loud warehouse (TV + forklift simulation): Measure accuracy
- [ ] Auto-classification accuracy: Does system correctly detect environment?

---

## Rollout Strategy

### Beta Phase (2-4 weeks)
1. **Deploy to 2-3 test users** (early adopters)
2. **Daily check-ins** for feedback
3. **Measure metrics:**
   - Enrollment success rate
   - Cross-talk incidents
   - False positive/negative rates
4. **Iterate on threshold** (85% may be too strict or too loose)

### Production Rollout
1. **Feature flag:** `voice-biometric-enabled`
2. **Opt-in UI:** "Enable voice recognition for better accuracy?"
3. **Monitor dashboards:**
   - Enrollment rate
   - Verification latency
   - User satisfaction (survey after 1 week)
4. **Gradual rollout:** 10% → 25% → 50% → 100% over 2-4 weeks

---

## Success Metrics

| Metric | Current (Est.) | Target |
|--------|----------------|--------|
| Cross-talk rate (3+ users) | 30-50% | <1% |
| False positive (TV/radio) | 10-20% | <1% |
| False negative (correct user rejected) | N/A | <5% |
| Verification latency | N/A | <200ms |
| Enrollment completion rate | N/A | >90% |
| User satisfaction (post-enrollment) | N/A | 8/10+ |

---

## FAQ

### Q: What if my voice changes (cold, illness)?
**A:** Voiceprints are robust to mild changes. If accuracy drops, user can re-enroll.

### Q: Can someone record my voice and play it back to spoof the system?
**A:** Azure includes liveness detection. SpeechBrain doesn't, but we can add challenge-response ("Say a random number") if needed.

### Q: How long does enrollment take?
**A:** 5-10 minutes for 10-15 samples. We can reduce to 5 samples (2-3 minutes) with accuracy trade-off.

### Q: What if I don't want to enroll?
**A:** System works without voiceprint (current behavior). Voiceprint is opt-in for better accuracy.

### Q: Can I use this on multiple devices?
**A:** Yes! Voiceprint syncs via Supabase. Log in on any device, voiceprint activates automatically.

---

**Status:** ✅ READY TO IMPLEMENT
**Next Step:** Choose API (Azure recommended) and start Phase 1
**Timeline:** 4-6 weeks for full Phase 1-3 implementation
