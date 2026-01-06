# Troubleshooting Guide for iPhone Safari Issue

## Issue Summary
Davy is experiencing an issue where:
1. He loads a route via URL on his iPhone (Safari browser, not PWA)
2. The app shows "Starting north route" (TTS plays successfully)
3. But then the system stops/freezes
4. No audio is heard after that
5. The system is not picking up his voice responses

## Most Likely Causes

Based on the codebase analysis, here are the most probable causes in order of likelihood:

### 1. Microphone Permission Not Granted
- iOS Safari requires explicit microphone permission
- Without it, the app can speak but cannot listen
- The Deepgram WebSocket will connect, but MediaRecorder will fail silently

### 2. Audio Context Not Unlocked
- Safari requires a user gesture (tap) to enable audio
- Even though there's a "Tap Anywhere to Begin" screen for iOS, something might be bypassing it
- If AudioContext remains suspended, audio playback fails

### 3. Deepgram WebSocket Connection Timeout
- The WebSocket has a 10-second connection timeout
- If Deepgram doesn't connect, the system can't receive voice input
- This would fail silently in the background

### 4. MediaRecorder Not Starting
- Safari iOS has specific requirements for audio recording
- If the MediaRecorder fails to start, no audio is sent to Deepgram
- The app might appear to be listening but isn't actually capturing audio

## Diagnostic Tool Instructions

I've added a **hidden diagnostic panel** to help troubleshoot this remotely:

### How to Access Diagnostics:
1. **Triple-tap anywhere on the screen quickly** (within 1 second)
2. A diagnostic overlay will appear in the bottom-right corner
3. Take a screenshot of this panel when the issue occurs

### What the Diagnostic Panel Shows:
- **Voice Status**: Current state (listening, speaking, etc.)
- **Mic Permission**: granted/denied/prompt/not-supported
- **AudioContext**: running/suspended/closed
- **Deepgram WebSocket**: connected/disconnected
- **MediaRecorder**: recording/stopped/paused
- **Last heard**: What the system last transcribed
- **Last spoken**: What the system last said via TTS
- **Recent Errors**: Any errors that occurred

## Step-by-Step Troubleshooting

### For Davy to Try:

#### Attempt 1: Fresh Start with Diagnostics
1. **Clear Safari cache and site data**:
   - Go to iPhone Settings > Safari > Clear History and Website Data
   - OR: Settings > Safari > Advanced > Website Data > Remove All

2. **Load the app fresh** (with route URL or without)

3. **When prompted "Tap Anywhere to Begin"**:
   - Make sure you tap the screen
   - Check if you see a microphone permission popup
   - **GRANT** the microphone permission if asked

4. **As soon as you see "Starting north route"**:
   - Triple-tap the screen immediately
   - Take a screenshot of the diagnostic panel
   - Send the screenshot

#### Attempt 2: Manual Permission Check
1. **Check microphone permissions manually**:
   - Go to Safari while on the app page
   - Tap the "aA" button in the address bar (or the lock icon)
   - Look for "Website Settings" or "Microphone"
   - Ensure it's set to "Allow"

2. **Refresh the page** (hard refresh: pull down while at top of page)

3. **Try loading a route again**

4. **Triple-tap to see diagnostics**

5. **Screenshot and send**

#### Attempt 3: Check Audio Settings
1. **Unmute iPhone** (check the physical mute switch on left side)
   - Even with AirPods, the mute switch can affect microphone

2. **Check Volume**:
   - Make sure volume is up (use volume buttons)
   - Some iOS Safari issues are related to zero volume

3. **Try WITHOUT AirPods first**:
   - Use built-in speaker and mic
   - If it works, then try with AirPods

4. **Triple-tap for diagnostics when issue occurs**

#### Attempt 4: Minimal Test
1. **Start without loading a route**:
   - Go to the app URL without the route parameter
   - Just load the base app

2. **Wait for the initial greeting**

3. **Try saying "OK Stocker, what's next"**

4. **Triple-tap to see diagnostics**

5. **Screenshot the diagnostic panel**

## What to Look For in Screenshots

When Davy sends screenshots of the diagnostic panel, check:

### Good State (Working):
```
Voice Status: listening
Mic Permission: granted
AudioContext: running
Deepgram WebSocket: connected
MediaRecorder: recording
```

### Bad States (Common Issues):

**Issue: Mic Permission Denied**
```
Mic Permission: denied  ← PROBLEM HERE
AudioContext: running
Deepgram WebSocket: connected
MediaRecorder: stopped  ← Can't record without permission
```

**Issue: AudioContext Suspended**
```
AudioContext: suspended  ← PROBLEM HERE
Mic Permission: granted
```
→ Fix: User needs to tap the screen

**Issue: Deepgram Not Connected**
```
Deepgram WebSocket: disconnected  ← PROBLEM HERE
Mic Permission: granted
AudioContext: running
```
→ Check Recent Errors for WebSocket timeout or error

**Issue: MediaRecorder Not Recording**
```
MediaRecorder: stopped  ← PROBLEM HERE
Mic Permission: granted
AudioContext: running
Deepgram WebSocket: connected
```
→ Check Recent Errors for MediaRecorder failure

## Additional Console Logs

The system now emits diagnostic events that can be viewed in Safari's console:

### To View Console on iPhone:
1. Connect iPhone to Mac
2. Open Safari on Mac
3. Enable Develop menu: Safari > Preferences > Advanced > "Show Develop menu in menu bar"
4. With iPhone connected: Develop > [iPhone Name] > [Tab Name]
5. Console will show all diagnostic events

### Look for these console messages:
- `[Voice] MediaRecorder started` - Should see this when listening starts
- `[Voice] Utterance end - processing immediately` - When voice is detected
- `[Voice] Deepgram WebSocket error` - Connection problems
- `[Voice] MediaRecorder error` - Recording problems
- `[Voice] Audio play blocked by browser` - User gesture needed

## Quick Reference: Common Fixes

| Symptom | Most Likely Cause | Fix |
|---------|------------------|-----|
| TTS works, but no listening | Microphone permission denied | Grant permission via Safari settings |
| Nothing plays at all | AudioContext suspended | Tap the screen |
| "Starting route" then freeze | Deepgram timeout or MediaRecorder failed | Check diagnostics for errors |
| Works on desktop, not iPhone | Safari-specific audio restrictions | Ensure tap-to-unlock happened |
| Works first time, not after | Cached permission or audio state | Clear Safari cache |

## Testing Checklist for Davy

- [ ] Clear Safari cache
- [ ] Load app fresh
- [ ] Tap when prompted "Tap Anywhere to Begin"
- [ ] Grant microphone permission when asked
- [ ] Load route (or let it load from URL)
- [ ] Wait for "Starting north route"
- [ ] Triple-tap screen immediately
- [ ] Screenshot diagnostic panel
- [ ] Try saying something
- [ ] Triple-tap again
- [ ] Screenshot diagnostic panel again
- [ ] Send both screenshots

## Next Steps

Once we have the diagnostic screenshots, we can:
1. Identify the exact failure point
2. Determine if it's a permission, connection, or audio issue
3. Apply the specific fix needed
4. Potentially add more explicit error messages for users
5. Consider adding a startup health check that validates all systems

## Contact Points

If diagnostics show all systems working but voice still not detected:
- Check if Safari is up to date (Settings > General > Software Update)
- Try in Chrome for iOS (for comparison)
- Check for any iOS-wide microphone restrictions (Settings > Privacy > Microphone)
- Consider if any MDM/parental controls are blocking microphone access
