# Voice: session state × command class × timing window

**What this is.** One row for every way the app can be caught when the picker speaks: the state it
is in, the kind of thing he said, and what else was happening at that moment. Each row records how
many things the app does in response to that one utterance — none, one, or two — and whether that is
right. None means he spoke and nothing happened. Two means he said one thing and the app did two.

Every count was read off the source files named below. Nothing here was measured on a device, and
no row is a report of something a driver hit — rows marked `finding` are candidates that still need
to be proven before they are called bugs.

## Header block — what this was derived from

| | |
|---|---|
| Source | `src/hooks/useVoice.ts` |
| Source | `src/utils/commandRecognizer.ts` |
| Source | `src/hooks/reconnectPolicy.ts` |
| Source | `src/hooks/voiceHandoffPolicy.ts` |
| `BUILD_VERSION` those files carried when read | `v0.1.0-rawpcm` (`src/hooks/useVoice.ts` line 20) |
| Commit SHA of the working tree read | `36f42f89a8d7cf106f6242de15f7c2353452e9d0` |
| Rows | 112 = 7 session states × 4 command classes × 4 timing windows |

**Re-derivation trigger.** This table is regenerated whenever any of those four source files
changes. To check whether it is stale, compare the SHA above against the current one:
`git log -1 --format=%H -- src/hooks/useVoice.ts src/utils/commandRecognizer.ts src/hooks/reconnectPolicy.ts src/hooks/voiceHandoffPolicy.ts`. If that SHA is newer than the one
recorded here, the table has not been re-read against the current code.

**Reading it needs nothing.** This is plain markdown in the repository — no build, install, or
generation step. Open it and read it.

---

## Definitions

### Action

**One action = one downstream effect produced from a single utterance** — a wake, a direction
change, a pick confirmation, or a spoken response — counted once per effect.

- **The counting unit is exactly one utterance.** A count of 2 means one spoken phrase produced two
  effects.
- **The action-count column holds only 0, 1, or 2.** Anything above 2 is recorded as 2 with a note
  naming the additional effects. A `not-reachable` row records 0, because a combination that
  cannot occur produces no actions; the verdict column is what distinguishes that 0 from a 0 the
  driver actually experiences.
- Interrupting playback is not counted as an action of its own: it cuts a response short rather
  than producing one. Re-speaking a line *is* counted, because the picker hears it.

### The seven session states

Exactly the seven values in the `VoiceStatus` union (`src/hooks/useVoice.ts` line 9), in that
declared order: `idle`, `listening`, `speaking`, `thinking`, `paused`, `muted`, `error`. No state
name appears in this document that is absent from that union.

### The four command classes

1. **Wake phrases** — the `WAKE_PHRASES` entries built on the app's real name, `ok stocker`,
   `okay stocker`, `hey stocker` and bare `stocker`, which mean "wake up and listen".
2. **Known mishearings** — the rest of `WAKE_PHRASES`: `ok stalker`, `ok docker`, `ok soccer`,
   `stoker`, `ok stock` and their variants, which are not the app's name but are what the speech
   service reliably returns when the picker says it.
3. **Direction words** — what `commandRecognizer.ts` classifies as `DIRECTION_TOP` or
   `DIRECTION_BOTTOM`: "top", "bottom", "from the beginning", "last", "reverse" and the rest of
   those two pattern lists.
4. **Picking commands** — everything else `commandRecognizer.ts` classifies: next item, skip
   machine, inventory query, repeat, affirmative, go back, previous item, undo, which machine, and
   machines left.

### The four timing windows

The timing-window column holds exactly these four. Any window added later must be backed by a
named symbol in `src/hooks/useVoice.ts`, `src/hooks/reconnectPolicy.ts`, or
`src/hooks/voiceHandoffPolicy.ts`.

**1. Spoken over app speech.** The `TTS_URL` playback interval in `useVoice.ts`: from the echo
anchor set in `speak` (line 1495, immediately before the `TTS_URL` fetch at line 1522) until
playback resolves and the anchor is closed (line 1693).

**2. Mid-reconnect.** From `socket.onclose` (line 802) through the delay returned by
`gentleReconnect` in `reconnectPolicy.ts` and the `connectDeepgram` attempt it schedules (line 890),
until a new socket opens. `gentleReconnect` allows four attempts at 0.5 s, 1 s, 2 s and 2.5 s, then
gives up — so this window can hold for roughly six seconds plus the connection attempts inside it.
The socket is closed for its whole length.

**3. Watchdog restart boundary.** The moment `watchdogAction` in `voiceHandoffPolicy.ts` returns
`'recover'` — it fires from the 2-second poll in `useVoice.ts` (lines 1270-1290) once the app has
been stuck off `listening` with a command waiting for `WATCHDOG_STUCK_THRESHOLD_MS` (6000 ms).
**This window never opens in the shipped code — see finding GRID-001.**

**4. During auth token fetch.** The `DEEPGRAM_TOKEN_URL` fetch inside `ensureToken`
(`useVoice.ts` lines 418-420), awaited by `connectDeepgram` (line 683) after any lingering socket
has already been closed (lines 673-679). Bounded by `AbortSignal.timeout(10000)`, so it can hold
for up to ten seconds, and no socket exists for any of it.

### The three verdicts

Every row carries exactly one, never zero and never two.

- **`expected-and-verified`** — the recorded action count matches what the code in the named source
  is intended to produce, and the row names the source that was read.
- **`finding`** — the action count is 0 or 2 where 1 is required for one utterance to produce one
  action, or the count is 1 but the action taken is the wrong one. **A row whose action count could
  not be read off the four named source files as a single value is recorded as `finding`, never as
  `expected-and-verified`.** That is why cells whose count changes partway through their own window
  are findings.
- **`not-reachable`** — a named guard in one of the four sources makes that state, command class and
  timing window unable to co-occur. Every such row names the specific guard, condition, or early
  return; none is marked on assertion alone.

Rows verdicted `finding` carry their identifier in the verdict cell as
`finding · candidate_id: GRID-00N`, in the format the proof gate
(`.xf/specs/2026-07-30-voice-proof-gate-xffi.md`) consumes for its `findings` and `dropped_list`
arrays. One candidate can anchor several rows where one defect shows up in several cells.

### Evidence

Every count cites the file and symbol it was read from, and citations come only from
`src/hooks/useVoice.ts`, `src/utils/commandRecognizer.ts`, `src/hooks/reconnectPolicy.ts`, and
`src/hooks/voiceHandoffPolicy.ts`. No cell states a count without a named source. Where one of those
files delegates to a helper — `isEcho` to `echoFilter.ts`, the stitching to
`transcriptAccumulator.ts`, the phrase list to `wakePhrases.ts` — the citation names the calling
symbol in the source file, and the helper is named alongside it.

---

## The analysis this was built on

### Which states gate transcript handling, and which do not

`processAccumulatedTranscript` (`useVoice.ts` lines 443-507) is the single gate. Of the seven
states:

- **`listening`, `idle` and `speaking` pass straight through** (line 462) and dispatch to the
  command handler. `speaking` additionally interrupts playback first (lines 491-496).
- **`thinking` also dispatches**, but by a different route: it fails the line-462 test, falls into
  `resolveHandoffCommand`, and that returns `'dispatch'` for it (`voiceHandoffPolicy.ts` lines
  89-96). Until the 2026-07-30 sibling round it returned `'queue'` here, which is why this used to
  be a state where speech went missing.
- **`paused` and `muted` are gated to the wake phrase alone** (lines 453-459). Ordinary commands are
  discarded on purpose, and the reasoning is written out at `voiceHandoffPolicy.ts` lines 98-108: a
  picking word held through a pause would fire against whatever item is current when he resumes,
  which means wrong stock with no explanation.
- **`error` queues and is never flushed** — `resolveHandoffCommand` returns `'queue'` (line 109),
  intending the watchdog to release it on recovery. Both halves are unreachable; see GRID-001.

That is the source of every action count of zero in this table, together with one thing the gate
cannot see: whether a transcript exists to gate at all. Three of the four timing windows hold the
socket closed, and audio is only sent when `micSendingRef` is true *and* the socket is open
(`useVoice.ts` line 623).

### Which module decides what

The two modules split cleanly, and the split is why each command class is attributed the way it is:

- **`useVoice.ts` decides that a transcript is a command at all** — whether the audio was even sent,
  whether the fragments are stitched into one sentence, whether it is the app hearing itself, and
  whether the current state allows it through. It never decides what the words mean, with one
  exception: in `paused` and `muted` it does its own wake-phrase test (`hasWakePhrase` /
  `extractWakeCommand`, lines 188-205) and calls back separately.
- **`commandRecognizer.ts` decides what the command does** — four tiers, in order: phonetic
  correction, exact patterns, filler-tolerant stripping, then fuzzy matching, falling through to
  `UNKNOWN` (lines 339-374). It never sees state or timing.

So direction words and picking commands are attributed to `commandRecognizer.ts`, and wake phrases
and known mishearings to `useVoice.ts` — which is exactly where their handling diverges by state.

### Why known mishearings are a class of their own

They are not assumed to be a fourth class; the code treats them as one. `WAKE_PHRASES`
(`wakePhrases.ts` lines 33-40) makes no distinction — `hasWakePhrase` and `extractWakeCommand`
accept `ok stalker` exactly as they accept `ok stocker`, so in `paused` and `muted` the two classes
behave identically. They diverge everywhere else, because the *other* consumer of the app's name is
`commandRecognizer.ts`'s `looseMatch`, which strips `APP_NAME_TOKENS` (line 506) before re-matching.
That list holds `stocker`, `stalker`, `stoker`, `docker`, `soccer` — but `WAKE_PHRASES` also carries
`ok stock`, `okay stock` and `hey stock`, and `stock` is **not** in `APP_NAME_TOKENS`. So "OK Stock,
next" is a wake phrase to `useVoice.ts` and an unrecognized sentence to `commandRecognizer.ts`. Two
lists, one name, still not quite agreeing.

### `gentleReconnect` and `watchdogAction` in flight together

They cannot be. `gentleReconnect` runs while a reconnect is pending; it ends either by opening a
socket or, after four attempts, by `giveUp` — which sets the state to `error`
(`useVoice.ts` lines 860-865). `watchdogAction` requires a queued command
(`voiceHandoffPolicy.ts` line 145), and the queue can only be filled in `error`. But `error` is the
state reconnection lands in *after* giving up, and `shouldReconnectFromStatus` returns false for it
on purpose (`reconnectPolicy.ts` line 67), so no reconnect is ever in flight from there. If the two
windows could overlap, `recoverStatus` would decide the resulting state — it returns `listening` for
everything except `paused` and `muted`, which it preserves (`voiceHandoffPolicy.ts` lines 120-125).

### What `resolveHandoffCommand` and `recoverStatus` contribute to the count

`resolveHandoffCommand` is what makes the count 1 instead of 0 in `thinking`: it returns
`'dispatch'` for `listening`, `idle`, `speaking` and `thinking`, `'ignore'` for `paused` and
`muted`, and `'queue'` for `error` (lines 89-109). It cannot produce a count of 2 — it returns one
decision per utterance.

`recoverStatus` contributes nothing to any count as shipped, because its only caller is the
watchdog branch (`useVoice.ts` line 1281), which never runs. Were it to run, it would force
`listening` and then `resumeListening` would fire the held command (lines 1245-1251) — that is the
one path in the code that could turn a single utterance into a second, later action, and it is the
path GRID-001 shows is dead.

**So no action count of 2 in this table comes from the hand-off policy.** The only 2 is GRID-005,
and it comes from the TTS failure path in `useVoice.ts`.

### How the token fetch and TTS playback each affect whether speech is heard

They fail in opposite ways, which is why they are separate windows.

- **The `DEEPGRAM_TOKEN_URL` fetch stops speech from ever becoming a transcript.** It is awaited
  inside `connectDeepgram` *after* any existing socket has been closed (lines 673-683), so for its
  whole length — up to ten seconds — there is no socket, the worklet's send guard (line 623) drops
  every frame, and the transcript handler is never called.
- **`TTS_URL` playback does not stop speech reaching the handler; it changes what the handler does
  with it.** Capture stays live throughout, which is what makes interruption possible at all. What
  filters is `isEcho` (line 168, delegating to `echoFilter.ts`): a 300 ms blanket cooldown from the
  anchor, then a wording test that only applies to heard text longer than 10 characters that is a
  substring of the line being spoken.

The consequence for the table: every count under the token-fetch window is 0 for the same structural
reason, while counts under the speech window vary by what was said and exactly when.

### Can the windows overlap, and where does the app land if they do

| Pair | Overlap? | Which state the code lands in |
|---|---|---|
| Speech × mid-reconnect | **Yes** — a socket can drop mid-announcement | `speaking`. The close handler changes no state unless it gives up, and `shouldReconnectFromStatus` (`reconnectPolicy.ts` line 73) now includes `speaking`, so the reconnect runs underneath the announcement. |
| Mid-reconnect × token fetch | **Yes** — the fetch is inside the reconnect | Unchanged from whatever held before the drop. `connectDeepgram` awaits `ensureToken` (line 683) without touching state, so the token fetch is a strict sub-interval of the reconnect window. |
| Speech × token fetch | **Yes**, transitively — a drop during an announcement leads to both | `speaking`, for the same reason as the first row. |
| Mid-reconnect × watchdog | **No** | `shouldReconnectFromStatus` (`reconnectPolicy.ts` line 67) returns false for `error`, and `error` is the only state that can arm the watchdog. |
| Speech × watchdog | **No** | `watchdogAction` (`voiceHandoffPolicy.ts` line 145) needs a queued command, which `speaking` never produces — it dispatches (line 89-96). |
| Token fetch × watchdog | **No** | Same guard. Additionally the watchdog's own recovery path calls `resumeListening`, not `connectDeepgram`. |

---

## Findings

Seven candidates. None has been reproduced on a device; each names the code it was read from so it
can be proven or dropped through the proof gate.

### GRID-001 — the freeze watchdog can never fire

The safety net built for the 2026-07-12 freeze is unreachable in the shipped code, and the fix that
made it unreachable is the 2026-07-30 sibling round.

The chain: `watchdogAction` acts only with a command queued (`voiceHandoffPolicy.ts` line 145). The
only line that ever queues one is `useVoice.ts` line 474, reached only when `resolveHandoffCommand`
returns `'queue'`. Since the sibling round, that happens for `error` alone — every other state
dispatches or ignores (lines 89-109). And no transcript can arrive in `error`: all three
`setStatus('error')` sites (`useVoice.ts` lines 863, 1113, 1255) are reached with the socket closed,
and `shouldReconnectFromStatus` returns false for `error` on purpose (`reconnectPolicy.ts` line 67),
so nothing reopens it without a tap. The queue is therefore never filled, `watchdogAction` always
returns `'noop'`, and the poll at `useVoice.ts` lines 1270-1290 runs every two seconds for the life
of the session doing nothing.

The `error` branch of `resolveHandoffCommand` is dead in both directions: its comment (lines
106-107) says the driver's word is "HELD and flushed by the watchdog on recovery", and neither the
holding nor the flushing can happen.

**What it costs.** If the app freezes off `listening` in a way the current fixes do not cover, there
is no longer anything to catch it — the driver's only route out is to notice and tap. This is the
open thread the previous session read but did not establish; it is established now.

**Anchor rows.** None, by construction — all 28 watchdog-window rows are `not-reachable`, and that
is the finding.

### GRID-002 — the 300 ms echo cooldown is anchored before the fetch, not at playback

`speak` sets the echo anchor at line 1495, then fetches the audio at line 1522. `resolveEcho`
discards everything heard within `ECHO_COOLDOWN_MS` (300 ms) of that anchor
(`echoFilter.ts` line 68). When the line was not prefetched, the network fetch consumes most or all
of those 300 ms, so the blanket-discard window lands on silence — while the app is not yet speaking
and anything heard is genuinely the driver — and has expired by the time the app's own voice starts.
When the line *was* prefetched (lines 1505-1509), playback starts almost immediately and the
cooldown covers what it was built for.

**What it costs.** A dead spot of up to 300 ms that moves depending on whether the next line
happened to be prefetched: he speaks, nothing at all happens, and there is no pattern to it he could
learn.

**Anchor rows.** `speaking` × wake phrases / known mishearings / direction words × spoken over app
speech.

### GRID-003 — while paused or muted the microphone is off, so the wake phrase cannot be heard

Two places disagree about what pausing means. `processAccumulatedTranscript` is written to keep
listening for the app's name while paused or muted (lines 453-459) — that branch exists precisely so
the driver can restart hands-free. But `pauseListening` and `mute` both call `pauseCapture`, which
sets `micSendingRef.current = false` (line 646), and the worklet only sends audio when that flag is
true (line 623). No audio leaves the phone, so no transcript comes back, so that branch is never
reached.

**What it costs.** He pauses, later says "OK Stocker" to pick up again, and nothing happens — no
matter how many times he repeats it. Hands-free resume does not work; he has to look at the phone
and tap. This is the shape the survey keeps finding: two places deciding the same thing and
disagreeing.

**Anchor rows.** `paused` and `muted` × wake phrases / known mishearings × spoken over app speech and
during auth token fetch.

### GRID-004 — a reconnect while paused silently switches the microphone back on

The other side of GRID-003. `shouldReconnectFromStatus` returns true for `paused` and `muted`
(`reconnectPolicy.ts` lines 70-71), so a socket drop while paused is reconnected. On success,
`socket.onopen` calls `startPcmCapture` (line 770), which — because the capture graph is already
built — takes the early return at lines 609-612 and sets `micSendingRef.current = true`. Nothing
sets it back. The state is still `paused`, the screen still says paused, and the microphone is live
and streaming to the speech service again.

**What it costs.** Two things at once. It is the only way GRID-003's wake phrase ever works, which
makes hands-free resume depend on whether the connection happened to blip. And it means the app can
be sending audio while telling the driver it is paused — which is a promise the screen is making and
the code is not keeping.

**Anchor rows.** `paused` and `muted` × wake phrases / known mishearings × mid-reconnect.

### GRID-005 — interrupting the app on Android may make it re-speak the whole line

**Device-dependent and unproven — the strongest claim here is about a mechanism, not an occurrence.**

When the driver speaks over an announcement, the barge-in branch calls `stopAudio` (line 494), which
on the Android path pauses the element and then sets `src = ''` (lines 1343-1346). Setting an empty
source makes browsers fire an `error` event on a media element; the playback promise's `onerror`
handler rejects (lines 1585-1589); that rejection is caught by the TTS catch at line 1687, whose
only response is `await speakBrowser(processed)` — which re-speaks the entire announcement in the
flat browser voice and, unlike every other exit in `speak`, never checks `stoppedRef`.

The iOS and desktop path does not have this shape: `stopAudio` calls `source.stop()`, which fires
`onended` and resolves cleanly (lines 1663-1666).

**What it costs, if it occurs.** He interrupts to say "next", and the app both moves to the next item
and starts reading the previous announcement again in a different voice — one utterance, two effects.

**What is not established.** Whether setting `src = ''` actually fires `error` on the browsers Davy's
phone runs. That cannot be read off these four files, which is why the row is a `finding` and not a
verified count. It needs a device or a browser test before it is called a bug.

**Anchor row.** `speaking` × picking commands × spoken over app speech.

### GRID-006 — tapping "tap to reconnect" gives up to ten seconds of unexplained silence

From `error`, the manual retry runs `startListening`, which does not touch the state on the way in —
it only sets `listening` after the connection succeeds (line 1091). Inside it, `connectDeepgram`
awaits `ensureToken`, bounded at ten seconds (lines 418-420). For all of that time the state is
still `error`, the screen still reads "Voice paused — tap to reconnect" (the message set at line
864), and nothing he says is heard. The reconnect path raises "Reconnecting voice…" on its first
attempt (lines 883-885); the manual path raises nothing.

**What it costs.** He taps, gets no acknowledgement, and reasonably concludes the tap did not work —
so he taps again, which starts the whole thing over.

**Anchor rows.** `error` × all four command classes × during auth token fetch.

### GRID-007 — the app's own name, said on its own while listening, gets a non-answer

The app instructs the picker to say "OK Stocker" for commands. Said while paused, that alone means
"what's next": `extractWakeCommand` returns `"what's next"` when nothing follows the phrase
(`useVoice.ts` line 195). Said while listening, it takes the ordinary dispatch path into
`commandRecognizer.ts`, where the exact matcher fails, `looseMatch` strips the name and is left with
an empty string — so it returns null rather than re-matching (lines 541-544) — and the fuzzy tier
finds nothing within range. The result is `UNKNOWN`.

**What it costs.** The same two words mean "what's next" in one state and produce "I didn't catch
that" in another. Small, but it lands on the exact phrase the app tells him to use.

**Anchor rows.** `listening` × wake phrases / known mishearings × spoken over app speech.

---

## Two things this survey found that are not rows

Both concern utterances that *straddle* a window boundary rather than sitting inside one, so no
single cell holds them. Recorded here so they are not lost.

1. **A sentence cut in half by a drop is still acted on.** If the socket dies mid-utterance, the
   200 ms silence timer (`useVoice.ts` lines 561-563) fires shortly afterwards and processes
   whatever was banked — so the app acts on a fragment of what he said. The count is 1 and the action
   is wrong. This is the same family the `transcriptAccumulator` fix addressed, approached from the
   drop side rather than the stop-signal side.
2. **Barge-in leaves the state briefly wrong.** After an interruption, `processAccumulatedTranscript`
   sets `listening` (line 496) and dispatches; the parent then sets `thinking`; and `speak`'s own
   tail then sets `listening` again (line 1694), overwriting it while the request is still in
   flight. No action count changes today — `thinking` and `listening` both dispatch — so this costs
   nothing now. It would start costing something the moment those two states diverge again.

---

## The matrix

Rows are ordered deterministically: the seven `VoiceStatus` values in the order declared at
`src/hooks/useVoice.ts` line 9, then command class, then timing window. Two regenerations produce
the same order.

| session state | command class | timing window | action count | verdict | evidence | user-visible effect |
|---|---|---|---|---|---|---|
| idle | wake phrases | spoken over app speech | 0 | not-reachable | useVoice.ts `stopListening` (lines 1147-1162 close the socket and stop the mic tracks) before setStatus('idle') (line 1179) | Nothing to observe: reaching 'idle' means Stop was tapped, which closes the socket and stops the microphone before the state changes. The only other 'idle' is before the first connection, when the app has not spoken. |
| idle | wake phrases | mid-reconnect | 0 | not-reachable | useVoice.ts `stopListening` (line 1123, `shouldReconnectRef.current = false`) gating the close handler (line 837) | Nothing to observe: Stop switches reconnection off before the state becomes 'idle', so a reconnect is never in flight from here. |
| idle | wake phrases | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| idle | wake phrases | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679); useVoice.ts `startListening` (setStatus('listening') only at line 1091) | This is the gap right after Start is tapped and before the app is listening — up to 10 seconds in which nothing he says is heard. |
| idle | known mishearings | spoken over app speech | 0 | not-reachable | useVoice.ts `stopListening` (lines 1147-1162 close the socket and stop the mic tracks) before setStatus('idle') (line 1179) | Nothing to observe: reaching 'idle' means Stop was tapped, which closes the socket and stops the microphone before the state changes. The only other 'idle' is before the first connection, when the app has not spoken. |
| idle | known mishearings | mid-reconnect | 0 | not-reachable | useVoice.ts `stopListening` (line 1123, `shouldReconnectRef.current = false`) gating the close handler (line 837) | Nothing to observe: Stop switches reconnection off before the state becomes 'idle', so a reconnect is never in flight from here. |
| idle | known mishearings | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| idle | known mishearings | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679); useVoice.ts `startListening` (setStatus('listening') only at line 1091) | This is the gap right after Start is tapped and before the app is listening — up to 10 seconds in which nothing he says is heard. |
| idle | direction words | spoken over app speech | 0 | not-reachable | useVoice.ts `stopListening` (lines 1147-1162 close the socket and stop the mic tracks) before setStatus('idle') (line 1179) | Nothing to observe: reaching 'idle' means Stop was tapped, which closes the socket and stops the microphone before the state changes. The only other 'idle' is before the first connection, when the app has not spoken. |
| idle | direction words | mid-reconnect | 0 | not-reachable | useVoice.ts `stopListening` (line 1123, `shouldReconnectRef.current = false`) gating the close handler (line 837) | Nothing to observe: Stop switches reconnection off before the state becomes 'idle', so a reconnect is never in flight from here. |
| idle | direction words | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| idle | direction words | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679); useVoice.ts `startListening` (setStatus('listening') only at line 1091) | This is the gap right after Start is tapped and before the app is listening — up to 10 seconds in which nothing he says is heard. |
| idle | picking commands | spoken over app speech | 0 | not-reachable | useVoice.ts `stopListening` (lines 1147-1162 close the socket and stop the mic tracks) before setStatus('idle') (line 1179) | Nothing to observe: reaching 'idle' means Stop was tapped, which closes the socket and stops the microphone before the state changes. The only other 'idle' is before the first connection, when the app has not spoken. |
| idle | picking commands | mid-reconnect | 0 | not-reachable | useVoice.ts `stopListening` (line 1123, `shouldReconnectRef.current = false`) gating the close handler (line 837) | Nothing to observe: Stop switches reconnection off before the state becomes 'idle', so a reconnect is never in flight from here. |
| idle | picking commands | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| idle | picking commands | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679); useVoice.ts `startListening` (setStatus('listening') only at line 1091) | This is the gap right after Start is tapped and before the app is listening — up to 10 seconds in which nothing he says is heard. |
| listening | wake phrases | spoken over app speech | 1 | finding · candidate_id: GRID-007 | useVoice.ts `processAccumulatedTranscript` (line 462, 'listening' dispatches); useVoice.ts `isEcho` (line 168) → echoFilter.ts `resolveEcho` (lines 76-83); commandRecognizer.ts `looseMatch` (lines 497-545) | He says "OK Stocker" on its own and the app answers "I didn't catch that" or guesses at a command — the same two words, said while paused, mean "what's next". Δ count 1 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| listening | wake phrases | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885) | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 1) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| listening | wake phrases | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 1) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| listening | wake phrases | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 1) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| listening | known mishearings | spoken over app speech | 1 | finding · candidate_id: GRID-007 | useVoice.ts `processAccumulatedTranscript` (line 462, 'listening' dispatches); useVoice.ts `isEcho` (line 168) → echoFilter.ts `resolveEcho` (lines 76-83); wakePhrases.ts `APP_NAME_TOKENS` (lines 21-27) as stripped by commandRecognizer.ts `looseMatch` (line 506) | "OK Stalker, next" works, but "OK Stalker" alone gets the same non-answer as the real name. Δ count 1 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| listening | known mishearings | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885) | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 1) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| listening | known mishearings | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 1) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| listening | known mishearings | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 1) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| listening | direction words | spoken over app speech | 1 | expected-and-verified | useVoice.ts `processAccumulatedTranscript` (line 462, 'listening' dispatches); useVoice.ts `isEcho` (line 168) → echoFilter.ts `resolveEcho` (lines 76-83); commandRecognizer.ts `DIRECTION_TOP_PATTERNS`/`DIRECTION_BOTTOM_PATTERNS` (lines 188-212) | "Top" or "bottom" is heard and acted on once. Δ count 1 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| listening | direction words | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885) | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 1) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| listening | direction words | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 1) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| listening | direction words | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 1) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| listening | picking commands | spoken over app speech | 1 | expected-and-verified | useVoice.ts `processAccumulatedTranscript` (line 462, 'listening' dispatches); useVoice.ts `isEcho` (line 168) → echoFilter.ts `resolveEcho` (lines 76-83); echoFilter.ts `MIN_CONTENT_ECHO_LEN` (line 44) | The command is heard and acted on once. A picking phrase longer than 10 characters that is a substring of the line still playing is dropped instead (0) — deliberate, per echoFilter.ts. Δ count 1 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| listening | picking commands | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885) | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 1) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| listening | picking commands | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 1) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| listening | picking commands | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 1) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| speaking | wake phrases | spoken over app speech | 0 | finding · candidate_id: GRID-002 | useVoice.ts `speak` (line 1495 sets the echo anchor before the TTS fetch at line 1522); echoFilter.ts `resolveEcho` (line 68, `msSinceSpeechStarted < cooldownMs`); useVoice.ts `ECHO_COOLDOWN_MS` (line 150) | For the first 300 ms after the app starts preparing its next line, anything he says is dropped with no response at all. Whether that 300 ms covers the app's actual voice or covers silence depends on whether the line was prefetched, so the dead spot moves. After it passes, the count is 1. |
| speaking | wake phrases | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885); reconnectPolicy.ts `shouldReconnectFromStatus` (line 73, 'speaking') | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. |
| speaking | wake phrases | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| speaking | wake phrases | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". |
| speaking | known mishearings | spoken over app speech | 0 | finding · candidate_id: GRID-002 | useVoice.ts `speak` (line 1495 sets the echo anchor before the TTS fetch at line 1522); echoFilter.ts `resolveEcho` (line 68, `msSinceSpeechStarted < cooldownMs`); useVoice.ts `ECHO_COOLDOWN_MS` (line 150) | For the first 300 ms after the app starts preparing its next line, anything he says is dropped with no response at all. Whether that 300 ms covers the app's actual voice or covers silence depends on whether the line was prefetched, so the dead spot moves. After it passes, the count is 1. |
| speaking | known mishearings | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885); reconnectPolicy.ts `shouldReconnectFromStatus` (line 73, 'speaking') | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. |
| speaking | known mishearings | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| speaking | known mishearings | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". |
| speaking | direction words | spoken over app speech | 0 | finding · candidate_id: GRID-002 | useVoice.ts `speak` (line 1495 sets the echo anchor before the TTS fetch at line 1522); echoFilter.ts `resolveEcho` (line 68, `msSinceSpeechStarted < cooldownMs`); useVoice.ts `ECHO_COOLDOWN_MS` (line 150) | For the first 300 ms after the app starts preparing its next line, anything he says is dropped with no response at all. Whether that 300 ms covers the app's actual voice or covers silence depends on whether the line was prefetched, so the dead spot moves. After it passes, the count is 1. |
| speaking | direction words | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885); reconnectPolicy.ts `shouldReconnectFromStatus` (line 73, 'speaking') | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. |
| speaking | direction words | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| speaking | direction words | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". |
| speaking | picking commands | spoken over app speech | 2 | finding · candidate_id: GRID-005 | useVoice.ts barge-in branch (lines 491-496) → `stopAudio` (lines 1343-1346, `pause()` then `src = ''`); useVoice.ts Android playback `onerror` (lines 1585-1589); useVoice.ts TTS catch → `speakBrowser` (lines 1687-1690, no `stoppedRef` check) | On an Android phone, cutting the app off mid-sentence can make it start the whole announcement again in the flat fallback voice while his command is also being carried out — one thing said, two things happen. Δ count 2 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| speaking | picking commands | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885); reconnectPolicy.ts `shouldReconnectFromStatus` (line 73, 'speaking') | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 2) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| speaking | picking commands | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 2) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| speaking | picking commands | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 2) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| thinking | wake phrases | spoken over app speech | 1 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-96, 'thinking' → 'dispatch'); useVoice.ts `processAccumulatedTranscript` (lines 468-483) | Heard and passed on once, rather than parked until later. Δ count 1 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| thinking | wake phrases | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885) | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 1) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| thinking | wake phrases | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 1) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| thinking | wake phrases | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 1) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| thinking | known mishearings | spoken over app speech | 1 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-96, 'thinking' → 'dispatch'); useVoice.ts `processAccumulatedTranscript` (lines 468-483) | Heard and passed on once. Δ count 1 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| thinking | known mishearings | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885) | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 1) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| thinking | known mishearings | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 1) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| thinking | known mishearings | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 1) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| thinking | direction words | spoken over app speech | 1 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-96, 'thinking' → 'dispatch'); useVoice.ts `processAccumulatedTranscript` (lines 468-483) | "Top" or "bottom" spoken while the app is working is acted on immediately instead of being stranded. Δ count 1 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| thinking | direction words | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885) | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 1) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| thinking | direction words | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 1) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| thinking | direction words | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 1) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| thinking | picking commands | spoken over app speech | 1 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-96, 'thinking' → 'dispatch'); useVoice.ts `processAccumulatedTranscript` (lines 468-483); echoFilter.ts `MIN_CONTENT_ECHO_LEN` (line 44) | Acted on once. A phrase over 10 characters matching the line still playing is dropped instead (0). Δ count 1 here vs mid-reconnect, watchdog-restart-boundary, and during-auth-token-fetch (count 0) — `processAccumulatedTranscript` still dispatches here (useVoice.ts line 462) because capture stays live through playback. |
| thinking | picking commands | mid-reconnect | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); reconnectPolicy.ts `gentleReconnect` (lines 24-30); useVoice.ts first-attempt notice (lines 883-885) | He speaks and nothing happens, because there is no connection to carry it. On the first attempt the app tells him "Reconnecting voice…" so he waits instead of repeating himself. Δ count 0 here vs spoken-over-app-speech (count 1) — the socket is closed for this whole window, so the PCM send guard (useVoice.ts line 623) drops every frame. |
| thinking | picking commands | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. Δ count 0 here vs spoken-over-app-speech (count 1) — this window never opens at all (`watchdogAction`, voiceHandoffPolicy.ts line 145). |
| thinking | picking commands | during auth token fetch | 0 | expected-and-verified | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679) | He speaks and nothing happens, for as long as fetching the voice credential takes — up to 10 seconds. Reached from a reconnect, so he has already been told "Reconnecting voice…". Δ count 0 here vs spoken-over-app-speech (count 1) — no socket exists until `ensureToken` returns (useVoice.ts lines 418-420, 683). |
| paused | wake phrases | spoken over app speech | 0 | finding · candidate_id: GRID-003 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. The app is still speaking, which does not change this. |
| paused | wake phrases | mid-reconnect | 0 | finding · candidate_id: GRID-004 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. When this window closes, the reconnect's `socket.onopen` calls `startPcmCapture`, which re-arms the microphone (useVoice.ts lines 770 and 610) while the state still reads paused — see GRID-004. |
| paused | wake phrases | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 144, paused/muted → 'noop'); voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`) | Nothing to observe: the watchdog refuses to override a hold the driver chose, and separately the window never opens at all. See finding GRID-001. |
| paused | wake phrases | during auth token fetch | 0 | finding · candidate_id: GRID-003 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. Fetching the credential does not change this. |
| paused | known mishearings | spoken over app speech | 0 | finding · candidate_id: GRID-003 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. The app is still speaking, which does not change this. |
| paused | known mishearings | mid-reconnect | 0 | finding · candidate_id: GRID-004 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. When this window closes, the reconnect's `socket.onopen` calls `startPcmCapture`, which re-arms the microphone (useVoice.ts lines 770 and 610) while the state still reads paused — see GRID-004. |
| paused | known mishearings | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 144, paused/muted → 'noop'); voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`) | Nothing to observe: the watchdog refuses to override a hold the driver chose, and separately the window never opens at all. See finding GRID-001. |
| paused | known mishearings | during auth token fetch | 0 | finding · candidate_id: GRID-003 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. Fetching the credential does not change this. |
| paused | direction words | spoken over app speech | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. The app is still speaking, which does not change this. |
| paused | direction words | mid-reconnect | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. When this window closes, the reconnect's `socket.onopen` calls `startPcmCapture`, which re-arms the microphone (useVoice.ts lines 770 and 610) while the state still reads paused — see GRID-004. |
| paused | direction words | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 144, paused/muted → 'noop'); voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`) | Nothing to observe: the watchdog refuses to override a hold the driver chose, and separately the window never opens at all. See finding GRID-001. |
| paused | direction words | during auth token fetch | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. Fetching the credential does not change this. |
| paused | picking commands | spoken over app speech | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. The app is still speaking, which does not change this. |
| paused | picking commands | mid-reconnect | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. When this window closes, the reconnect's `socket.onopen` calls `startPcmCapture`, which re-arms the microphone (useVoice.ts lines 770 and 610) while the state still reads paused — see GRID-004. |
| paused | picking commands | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 144, paused/muted → 'noop'); voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`) | Nothing to observe: the watchdog refuses to override a hold the driver chose, and separately the window never opens at all. See finding GRID-001. |
| paused | picking commands | during auth token fetch | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. Fetching the credential does not change this. |
| muted | wake phrases | spoken over app speech | 0 | finding · candidate_id: GRID-003 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. The app is still speaking, which does not change this. |
| muted | wake phrases | mid-reconnect | 0 | finding · candidate_id: GRID-004 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. When this window closes, the reconnect's `socket.onopen` calls `startPcmCapture`, which re-arms the microphone (useVoice.ts lines 770 and 610) while the state still reads paused — see GRID-004. |
| muted | wake phrases | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 144, paused/muted → 'noop'); voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`) | Nothing to observe: the watchdog refuses to override a hold the driver chose, and separately the window never opens at all. See finding GRID-001. |
| muted | wake phrases | during auth token fetch | 0 | finding · candidate_id: GRID-003 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. Fetching the credential does not change this. |
| muted | known mishearings | spoken over app speech | 0 | finding · candidate_id: GRID-003 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. The app is still speaking, which does not change this. |
| muted | known mishearings | mid-reconnect | 0 | finding · candidate_id: GRID-004 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. When this window closes, the reconnect's `socket.onopen` calls `startPcmCapture`, which re-arms the microphone (useVoice.ts lines 770 and 610) while the state still reads paused — see GRID-004. |
| muted | known mishearings | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 144, paused/muted → 'noop'); voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`) | Nothing to observe: the watchdog refuses to override a hold the driver chose, and separately the window never opens at all. See finding GRID-001. |
| muted | known mishearings | during auth token fetch | 0 | finding · candidate_id: GRID-003 | useVoice.ts `pauseCapture` (line 646, `micSendingRef.current = false`) vs the wake-phrase branch in `processAccumulatedTranscript` (lines 453-459) | He says the app's name to wake it and nothing happens, however many times he repeats it — the only way back is to look at the phone and tap. Fetching the credential does not change this. |
| muted | direction words | spoken over app speech | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. The app is still speaking, which does not change this. |
| muted | direction words | mid-reconnect | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. When this window closes, the reconnect's `socket.onopen` calls `startPcmCapture`, which re-arms the microphone (useVoice.ts lines 770 and 610) while the state still reads paused — see GRID-004. |
| muted | direction words | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 144, paused/muted → 'noop'); voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`) | Nothing to observe: the watchdog refuses to override a hold the driver chose, and separately the window never opens at all. See finding GRID-001. |
| muted | direction words | during auth token fetch | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. Fetching the credential does not change this. |
| muted | picking commands | spoken over app speech | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. The app is still speaking, which does not change this. |
| muted | picking commands | mid-reconnect | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. When this window closes, the reconnect's `socket.onopen` calls `startPcmCapture`, which re-arms the microphone (useVoice.ts lines 770 and 610) while the state still reads paused — see GRID-004. |
| muted | picking commands | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 144, paused/muted → 'noop'); voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`) | Nothing to observe: the watchdog refuses to override a hold the driver chose, and separately the window never opens at all. See finding GRID-001. |
| muted | picking commands | during auth token fetch | 0 | expected-and-verified | voiceHandoffPolicy.ts `resolveHandoffCommand` (line 108, paused/muted → 'ignore') | Nothing happens, which is intended: a picking word said out of habit while paused is dropped rather than held, so it cannot fire a phantom pick against whatever item is current when he resumes. Fetching the credential does not change this. |
| error | wake phrases | spoken over app speech | 0 | not-reachable | reconnectPolicy.ts `shouldReconnectFromStatus` (line 67); useVoice.ts setStatus('error') sites (lines 863, 1113, 1255) | Nothing to observe: no transcript can be delivered in this state. Every path into 'error' leaves the Deepgram socket closed, and `shouldReconnectFromStatus` returns false for 'error' on purpose, so nothing reopens it without a tap. |
| error | wake phrases | mid-reconnect | 0 | not-reachable | reconnectPolicy.ts `shouldReconnectFromStatus` (line 67); useVoice.ts give-up branch (lines 860-865) | Nothing to observe: 'error' is the state the app lands in *after* reconnection gave up, so a reconnect can never be in flight while it holds. |
| error | wake phrases | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| error | wake phrases | during auth token fetch | 0 | finding · candidate_id: GRID-006 | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679); useVoice.ts `startListening` (no state change until line 1091) | He taps "tap to reconnect", and for up to 10 seconds the screen still reads "Voice paused — tap to reconnect" and nothing he says is heard, with nothing to tell him the tap worked. |
| error | known mishearings | spoken over app speech | 0 | not-reachable | reconnectPolicy.ts `shouldReconnectFromStatus` (line 67); useVoice.ts setStatus('error') sites (lines 863, 1113, 1255) | Nothing to observe: no transcript can be delivered in this state. Every path into 'error' leaves the Deepgram socket closed, and `shouldReconnectFromStatus` returns false for 'error' on purpose, so nothing reopens it without a tap. |
| error | known mishearings | mid-reconnect | 0 | not-reachable | reconnectPolicy.ts `shouldReconnectFromStatus` (line 67); useVoice.ts give-up branch (lines 860-865) | Nothing to observe: 'error' is the state the app lands in *after* reconnection gave up, so a reconnect can never be in flight while it holds. |
| error | known mishearings | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| error | known mishearings | during auth token fetch | 0 | finding · candidate_id: GRID-006 | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679); useVoice.ts `startListening` (no state change until line 1091) | He taps "tap to reconnect", and for up to 10 seconds the screen still reads "Voice paused — tap to reconnect" and nothing he says is heard, with nothing to tell him the tap worked. |
| error | direction words | spoken over app speech | 0 | not-reachable | reconnectPolicy.ts `shouldReconnectFromStatus` (line 67); useVoice.ts setStatus('error') sites (lines 863, 1113, 1255) | Nothing to observe: no transcript can be delivered in this state. Every path into 'error' leaves the Deepgram socket closed, and `shouldReconnectFromStatus` returns false for 'error' on purpose, so nothing reopens it without a tap. |
| error | direction words | mid-reconnect | 0 | not-reachable | reconnectPolicy.ts `shouldReconnectFromStatus` (line 67); useVoice.ts give-up branch (lines 860-865) | Nothing to observe: 'error' is the state the app lands in *after* reconnection gave up, so a reconnect can never be in flight while it holds. |
| error | direction words | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| error | direction words | during auth token fetch | 0 | finding · candidate_id: GRID-006 | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679); useVoice.ts `startListening` (no state change until line 1091) | He taps "tap to reconnect", and for up to 10 seconds the screen still reads "Voice paused — tap to reconnect" and nothing he says is heard, with nothing to tell him the tap worked. |
| error | picking commands | spoken over app speech | 0 | not-reachable | reconnectPolicy.ts `shouldReconnectFromStatus` (line 67); useVoice.ts setStatus('error') sites (lines 863, 1113, 1255) | Nothing to observe: no transcript can be delivered in this state. Every path into 'error' leaves the Deepgram socket closed, and `shouldReconnectFromStatus` returns false for 'error' on purpose, so nothing reopens it without a tap. |
| error | picking commands | mid-reconnect | 0 | not-reachable | reconnectPolicy.ts `shouldReconnectFromStatus` (line 67); useVoice.ts give-up branch (lines 860-865) | Nothing to observe: 'error' is the state the app lands in *after* reconnection gave up, so a reconnect can never be in flight while it holds. |
| error | picking commands | watchdog restart boundary | 0 | not-reachable | voiceHandoffPolicy.ts `watchdogAction` (line 145, `hasPendingCommand`); useVoice.ts line 474 (sole writer of pendingCommandRef); voiceHandoffPolicy.ts `resolveHandoffCommand` (lines 89-109) | Nothing to observe: this window never opens. The watchdog only acts with a command queued, and the queue can only be filled in 'error' — a state in which no transcript can arrive. See finding GRID-001. |
| error | picking commands | during auth token fetch | 0 | finding · candidate_id: GRID-006 | useVoice.ts PCM send guard (line 623, `socketRef.current?.readyState === WebSocket.OPEN`); useVoice.ts `ensureToken` (lines 418-420, `DEEPGRAM_TOKEN_URL` with a 10 s timeout) as awaited by `connectDeepgram` (line 683, after the old socket is closed at lines 673-679); useVoice.ts `startListening` (no state change until line 1091) | He taps "tap to reconnect", and for up to 10 seconds the screen still reads "Voice paused — tap to reconnect" and nothing he says is heard, with nothing to tell him the tap worked. |

---

## Summary

| verdict | rows |
|---|---|
| `expected-and-verified` | 46 |
| `finding` | 22 |
| `not-reachable` | 44 |
| **total** | **112** |

The three counts sum to 112, which is the required 112 rows (7 states × 4 command classes × 4 timing windows).

**How to read the shape of it.** Forty-four rows are `not-reachable`, and twenty-eight of those are
the entire watchdog window — that is GRID-001, not padding. Of the remainder, the largest single
group is a count of 0 during mid-reconnect and token fetch: for a large part of a recovery the app
is structurally deaf, which is expected, and the thing that makes it survivable is that it now says
so out loud on the first attempt. The rows that should be looked at first are the eight where the
driver is given no such warning: `error` × during auth token fetch (GRID-006), and `paused` /
`muted` × wake phrases (GRID-003), where the app is written to be listening for him and is not.

