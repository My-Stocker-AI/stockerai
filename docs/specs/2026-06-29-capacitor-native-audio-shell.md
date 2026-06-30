# XFFI Spec — Create a Capacitor-based native app (iOS + Android) that wraps the existing Stoc
Generated: 2026-06-29
Intent: Create a Capacitor-based native app (iOS + Android) that wraps the existing StockerAI React PWA with native audio-session management: keep the microphone live for hands-free interrupt, route TTS to the loud speaker without Bluetooth, and route to A2DP/AirPods when present. The web voice loop remains unchanged, sharing the existing backend and auth, with distribution via App Store and Play Store.

## Roots

- src/hooks/useVoice.ts
- src/hooks/useDeepgramSTT.ts
- .xf/specs/2026-06-29-settings-panel.md

## Terminals

Build
- [ ] Capacitor plugin bindings (iOS: Swift for AVAudioSession, Android: Kotlin for AudioManager) are wrapped in a single @capacitor/audio-routing plugin <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] PWA build pipeline (Vite) is unchanged; native app build uses Xcode and Android Studio as entry points that load the same my-stocker-ai.com React output <!-- type:Build --> <!-- signoff: unsigned -->
- [ ] Plugin exports startAudioSession(mode: 'speaker'|'bluetooth'|'auto') and getAudioRoute():Promise<string> callable from Capacitor bridge in StockerApp.tsx <!-- type:Build --> <!-- signoff: unsigned -->

Understand
- [ ] Android OS routes audio to earpiece by default in MODE_IN_COMMUNICATION, a platform constraint (Chromium #1317548, leaf #1) that native code must override via MODE_NORMAL during TTS <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] The web layer keeps GENERATING the AI voice exactly as today (OpenAI "nova" TTS via the Cloudflare Worker) — NO native speech synthesis (AVSpeechSynthesizer/TextToSpeech) is used, so the voice never changes. The native plugin only PLAYS that web-provided audio file through the controllable native session (playAndRecord + defaultToSpeaker), keeping the mic live for barge-in <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] Session persistence (Supabase auth + route state in localStorage) must survive native app restart; SessionPlugin exposes session_id to native lifecycle handlers <!-- type:Comprehend --> <!-- signoff: unsigned -->
- [ ] The 16 fixes deployed in Session 76 (backend save/resume, logout/login guard in routes.py, delete-cascade, count/NULL guards) are all Supabase-side; native app benefits without code duplication <!-- type:Comprehend --> <!-- signoff: unsigned -->

Specify

  capacitor-shell-webview-and-shared-auth
  - [ ] Capacitor wraps the production React build (my-stocker-ai.com) without modification to useVoice.ts or backend integration <!-- type:Build --> <!-- check: file_exists | src/hooks/useVoice.ts | -->
  - [ ] Supabase auth session is shared between web context (localStorage) and native Capacitor webview via same project credentials (wvtkuposrlvadyeixlke) <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] SessionPlugin interface exposes session_id to native code for voice lifecycle coordination without duplicating authentication logic <!-- type:Build --> <!-- signoff: unsigned -->

  ios-audio-session-speaker-and-bluetooth-routing
  - [ ] AVAudioSession is configured with category=playAndRecord and options=[duckOthers,defaultToSpeaker] before any audio output <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Speaker is the default output when no Bluetooth device is connected; TTS routes to speaker automatically <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] A2DP/AirPods connection is detected via AVAudioSession route change handlers and routes TTS to wireless device without app restart <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Microphone remains active during TTS playback to enable barge-in (leaf #3 regression pattern: Deepgram WebSocket reconnection must not fire during speaker output) <!-- type:Build --> <!-- signoff: unsigned -->

  android-audio-session-speaker-and-bluetooth-routing
  - [ ] AudioManager mode is set to MODE_NORMAL (not MODE_IN_COMMUNICATION) before TTS to force STREAM_MUSIC routing to speaker, overriding the OS earpiece default (Chromium #1317548 constraint from leaf #1) <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Speaker is the default output sink when no Bluetooth device is enumerated; Bluetooth A2DP detection uses AudioManager.getDevices() <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Bluetooth device connection automatically routes audio without AudioManager mode re-initialization <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Microphone continues recording during TTS via separate MediaRecorder stream, unaffected by AudioManager mode transitions <!-- type:Build --> <!-- signoff: unsigned -->

  ios-permissions-and-app-store-packaging
  - [ ] NSMicrophoneUsageDescription is defined in Info.plist with voice-command-for-inventory-management rationale <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] App Store submission includes voice-first category; voice input purpose stated explicitly to pass review <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Required capabilities: Microphone; Bluetooth permissions automatic via AVAudioSession (no explicit NSBluetooth* needed for A2DP routing) <!-- type:Build --> <!-- signoff: unsigned -->

  android-permissions-and-play-store-packaging
  - [ ] RECORD_AUDIO and BLUETOOTH are declared in AndroidManifest.xml with runtime permission requests at app launch <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Play Store submission targets API 33+ (Android 13+); no voice-first category restrictions apply <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Permissions are granted before useVoice.ts initializes Deepgram WebSocket <!-- type:Build --> <!-- check: file_exists | src/hooks/useVoice.ts | -->

  native-plugin-unavailable-web-audio-fallback
  - [ ] If Capacitor audio plugin initialization fails, web fallback uses setSinkId() + enumerateDevices() for routing <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Deepgram WebSocket and useVoice.ts remain unchanged; fallback affects output sink selection only, not voice recognition or TTS source <!-- type:Build --> <!-- check: file_exists | src/hooks/useVoice.ts | -->
  - [ ] Feature detection at StockerApp.tsx startup determines native plugin availability before voice session initialization <!-- type:Build --> <!-- signoff: unsigned -->

  real-device-speaker-bluetooth-and-bargein-validation
  - [ ] Test matrix: iOS (iPhone physical device + AirPods), Android (Pixel device + Bluetooth speaker) with TTS output verified on each sink <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Validation: TTS heard from speaker on both platforms, heard from wireless device when paired, microphone active during playback <!-- type:Build --> <!-- signoff: unsigned -->
  - [ ] Barge-in validation (leaf #3): voice command interrupts TTS mid-playback on all platforms without Deepgram WebSocket reconnection error or connection-refused logs <!-- type:Build --> <!-- signoff: unsigned -->

Operate
- [ ] iOS distribution: App Store requires archived .ipa from Xcode; code signing and provisioning profiles configured for team development account <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] Android distribution: Play Store requires signed .aab from Android Studio; versionCode incremented per release, signing key stored in CI/CD env (not committed) <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] Backend (Python API at stockerai-api.onrender.com, Supabase project wvtkuposrlvadyeixlke) remains unchanged; native app uses same /api/ endpoints as web PWA, sharing session_id across platforms <!-- type:Operate --> <!-- signoff: unsigned -->
- [ ] Deployment pipeline: git push main → Cloudflare Pages auto-deploys PWA unchanged, AND GitHub Actions builds .ipa/.aab for store submission on tag (new step) <!-- type:Operate --> <!-- signoff: unsigned -->
