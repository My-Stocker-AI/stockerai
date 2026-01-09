# Stocker AI - Features & Benefits (Source of Truth)
**Last Updated:** 2025-12-28
**Purpose:** MECE inventory of all platform capabilities for User Guide and Marketing

---

## Platform Cost Analysis

### Per-Interaction Costs
| Component | Rate | Per Interaction | Notes |
|-----------|------|-----------------|-------|
| **Deepgram Nova-2 STT** | $0.0043/min | ~$0.00007 | Billed by second |
| **OpenAI GPT-4o-mini** | $0.15/1M in, $0.60/1M out | ~$0.00013 | ~650 tokens in, 50 out |
| **OpenAI TTS-1** | $15/1M chars | ~$0.00038 | ~25 chars response |
| **Total per interaction** | — | **~$0.0005** | — |

### Per-Route Costs (with VAD Optimization)
| Mode | STT Cost | LLM Cost | TTS Cost | Total/Route |
|------|----------|----------|----------|-------------|
| **Continuous streaming** | $0.19 | $0.02 | $0.06 | $0.27 |
| **VAD-gated streaming** | $0.05 | $0.02 | $0.06 | **$0.13** |

*VAD = Voice Activity Detection - only streams audio when speech detected*
*Assumes 45-min route, ~150 items, ~12 min actual speech*

### Per-Driver Monthly Cost
| Assumption | Value |
|------------|-------|
| Routes per driver per day | 1.5 avg |
| Working days per month | 22 |
| Platform cost per route | $0.13 (VAD) |
| **Platform cost per driver/month** | **~$4.29** |

Sources: [Deepgram Pricing](https://deepgram.com/pricing), [OpenAI Pricing](https://openai.com/api/pricing/)

---

## Pricing Model (Per-Driver)

### Why Per-Driver Pricing
- **Constant unit**: A driver can only physically service 15-20 machines/day
- **Anti-gaming**: Can't clone a human - usage caps are enforceable
- **Simple to understand**: "How many drivers?" vs complex route bundles
- **Scales correctly**: More drivers = more value delivered

### Pricing Tiers
| Tier | Drivers | Price/mo | Price/Driver | Platform Cost | Gross Margin |
|------|---------|----------|--------------|---------------|--------------|
| **Solo** | 1 | $29 | $29.00 | $4.29 | 85% |
| **Team** | 3 | $69 | $23.00 | $12.87 | 81% |
| **Fleet** | 5 | $99 | $19.80 | $21.45 | 78% |
| **Business** | 10 | $179 | $17.90 | $42.90 | 76% |

### With Partner Margin (20% Revenue Share)
| Tier | Price | Partner Cut | Net Revenue | Platform Cost | Net Margin |
|------|-------|-------------|-------------|---------------|------------|
| Solo | $29 | $5.80 | $23.20 | $4.29 | 82% |
| Team | $69 | $13.80 | $55.20 | $12.87 | 77% |
| Fleet | $99 | $19.80 | $79.20 | $21.45 | 73% |
| Business | $179 | $35.80 | $143.20 | $42.90 | 70% |

### Anti-Gaming Logic
| Machines/Driver/Day | Status | Action |
|---------------------|--------|--------|
| 1-20 | Normal | — |
| 21-25 | Elevated | Soft warning email |
| 26-30 | Suspicious | Account review |
| 30+ | Gaming | Suspension pending upgrade |

*Based on industry data: experienced drivers max ~22 machines/day*

---

## 1. ONBOARDING & ACCESS

### 1.1 User Authentication
| Feature | How to Use | Benefit |
|---------|-----------|---------|
| Email + password signup | Enter email, first/last name, password on login screen | Secure, personalized experience |
| Login/signup toggle | Tap "Login" or "Sign Up" tabs | One-click mode switch |
| Session persistence | Automatic | Stay logged in across app restarts |
| Forgot password | Tap "Forgot password?" link | Self-service recovery |

### 1.2 Platform Access
| Feature | How to Use | Benefit |
|---------|-----------|---------|
| **PWA (Progressive Web App)** | Visit my-stocker-ai.com, add to home screen | No app store download required |
| **iOS/Android/Desktop** | Works in any browser | Use any device you have |
| **Offline-capable caching** | Automatic | App loads even with poor connection |
| **Install to home screen** | Browser menu → "Add to Home Screen" | Looks and feels like native app |

---

## 2. ROUTE SETUP

### 2.1 PDF Upload & Parsing
| Feature | How to Use | Benefit |
|---------|-----------|---------|
| **Parlevel PDF import** | Tap Upload tab → Select PDF → Choose date | Import routes in seconds |
| **Automatic parsing** | System extracts machines, products, quantities | Zero manual data entry |
| **Multi-route per date** | Upload multiple PDFs for same date | Handle full work day |
| **Delivery date selection** | Date picker defaults to tomorrow | Future-dated routes ready to go |
| **Upload confirmation** | Shows route name, machine count, item count | Know it worked |

### 2.2 Route Selection
| Feature | How to Use | Benefit |
|---------|-----------|---------|
| **Auto-route detection** | Say nothing - AI greets with available routes | Knows your schedule |
| **Natural language date queries** | "What routes do I have for Friday?" | Ask naturally |
| **Multi-route awareness** | AI lists all routes for requested date | See full workload |
| **Route chaining** | After completing route, AI offers remaining routes | Seamless multi-route days |

---

## 3. VOICE INTERACTION

### 3.1 Speech Recognition (Deepgram Nova-2)
| Feature | How to Use | Benefit |
|---------|-----------|---------|
| **iOS Safari support** | Works automatically | Unlike Web Speech API |
| **Real-time streaming** | Continuous listening | No push-to-talk needed |
| **Keyword boosting** | Automatic for: next, done, skip, top, bottom | Higher accuracy on commands |
| **Noise suppression** | Automatic | Works in warehouse environment |
| **Echo cancellation** | Automatic | Filters out AI's voice |

### 3.2 Confirmation Commands (Advance to Next Item)
| Command | Variations | Benefit |
|---------|------------|---------|
| **"Next"** | next, next item, next one, what's next | Most intuitive |
| **"Done"** | done, got it, okay, ok | Natural confirmation |
| **"Yes"** | yes, yep, yeah, yup, uh huh | Simple affirmation |
| **"Ready"** | ready, alright, all right | Contextual confirmation |
| **"Check"** | check, checked, good, cool, great, perfect | Task completion language |
| **Tap screen** | Tap the current item card | Backup if voice fails |

### 3.3 Control Commands
| Command | What It Does | Benefit |
|---------|--------------|---------|
| **"Pause" / "Wait" / "Hold on"** | Pauses session, waits for wake phrase | Take breaks without losing place |
| **"Mute" / "Mute mic"** | Completely silences mic (wake phrase + unmute to resume) | Full privacy when needed |
| **"Oops" / "Regroup"** | Restart current machine from opposite direction | Fix wrong-direction mistakes |
| **"Skip machine" / "Skip this one"** | Skip to next machine | Handle inaccessible machines |
| **"Go back" / "Back to skipped"** | Return to previously skipped machine | Complete skipped work later |

### 3.4 Wake Phrase System
| Feature | Phrases Recognized | Benefit |
|---------|-------------------|---------|
| **Wake from pause** | "OK Stocker", "Hey Stocker", "Okay Stocker" | Hands-free resume |
| **Mishearing tolerance** | Also recognizes: "stalker", "stoker", "docker", "soccer", "stock" | Robust in noisy environments |
| **Unmute command** | "OK Stocker unmute" | Voice-activated unmute |

### 3.5 Undo Functionality
| Feature | How to Use | Benefit |
|---------|-----------|---------|
| **Undo last item** | Say "undo" or "go back one" | Fix mistakes instantly |
| **Error beep feedback** | Descending tone plays | Audio confirmation of undo |
| **Item restoration** | Previous item becomes current again | Resume from correct spot |

---

## 4. STOCKING WORKFLOW

### 4.1 Per-Machine Direction Choice
| Feature | How to Use | Benefit |
|---------|-----------|---------|
| **Top or bottom choice** | AI asks "Top of the list or bottom?" before each machine | Stock in your preferred order |
| **Direction commands** | "Top" / "beginning" / "first" OR "bottom" / "end" / "reverse" | Natural language |
| **Per-machine flexibility** | Choose differently for each machine | Match your workflow |

### 4.2 Item Presentation
| Feature | What You Hear/See | Benefit |
|---------|-------------------|---------|
| **Quantity first, then product** | "3 Doritos, slot 58" | Grab right amount immediately |
| **Slot location spoken** | Pre-formatted slot callouts | Find item fast |
| **Varied response styles** | AI randomly varies: "Next up...", "Grab...", "Got it..." | Less monotonous, stays engaging |
| **Visual item card** | Shows quantity, product, slot, machine | Glance for confirmation |
| **Inventory display** | "In machine: 4/6" | Know parlevel context |

### 4.3 Progress Tracking
| Feature | What You See | Benefit |
|---------|--------------|---------|
| **Machine progress badge** | "Machine 3/7" | Know where you are |
| **Completed items list** | Scrolling list with checkmarks | Visual record of work |
| **Route/machine name display** | Header shows current context | Always oriented |

---

## 5. SESSION MANAGEMENT

### 5.1 State Persistence
| Feature | How It Works | Benefit |
|---------|--------------|---------|
| **Auto-save after every item** | IndexedDB + Supabase sync | Never lose progress |
| **Resume from interruption** | App restores exact position | Phone dies? No problem |
| **24-hour session validity** | Sessions expire after 1 day | Fresh start each day |
| **Cross-device sync** | Supabase stores state by user | Switch devices mid-session |

### 5.2 Session Recovery
| Feature | How to Use | Benefit |
|---------|-----------|---------|
| **Resume dialog** | On app open: "Continue where you left off?" | Clear resume option |
| **Discard option** | "Start fresh" button | Clean slate when needed |
| **Last item context** | Shows route, machine, last completed item | Know exactly where you were |

---

## 6. AUDIO FEEDBACK

### 6.1 Audio Cues
| Sound | When It Plays | Purpose |
|-------|---------------|---------|
| **Success beep** (ascending C5→E5) | Item confirmed, advancing | Positive reinforcement |
| **Error beep** (descending A4→E4) | Undo action | Indicates going backward |
| **Ready beep** (high 880Hz) | After AI finishes speaking | Signals "your turn" |

### 6.2 Text-to-Speech
| Feature | Details | Benefit |
|---------|---------|---------|
| **OpenAI TTS-1** | Natural voice synthesis | Clear, professional audio |
| **n8n proxy** | Routes through your n8n instance | No exposed API keys |
| **Streaming playback** | Starts playing immediately | Faster response feel |

---

## 7. VISUAL INTERFACE

### 7.1 Status Indicators
| Indicator | Visual | Meaning |
|-----------|--------|---------|
| **Green pulsing dot** | Animated pulse ring | Listening for voice |
| **Purple speaking bars** | Animated wave bars | AI is talking |
| **Yellow processing** | Solid dot | Processing your command |
| **Red muted** | Mic with slash | Mic is off |
| **Gray paused** | Solid dot | Paused, waiting for wake phrase |

### 7.2 Layout Zones
| Zone | Content | Purpose |
|------|---------|---------|
| **Header** | Route name, machine badge | Orientation context |
| **Current Item Card** | Quantity, product, slot, machine | Primary focus area |
| **Voice Status Bar** | State indicator, last heard text | Feedback on recognition |
| **AI Response** | What AI just said (text) | Visual backup |
| **Completed List** | Items done | Progress tracking |
| **Navigation** | Voice / Upload tabs | Switch functions |

---

## 8. MULTI-ROUTE WORKFLOW

### 8.1 Route Completion Flow
| Feature | How It Works | Benefit |
|---------|--------------|---------|
| **Completion celebration** | "Nice work! [Route] is complete" | Positive feedback |
| **Auto-check for more routes** | AI queries remaining routes | Seamless continuation |
| **Route offer** | "You also have [Route B]. Want to start?" | Easy transition |
| **"Any more routes?"** | Ask anytime | Check remaining work |

### 8.2 Machine Skip & Return
| Feature | How It Works | Benefit |
|---------|--------------|---------|
| **Skip tracking** | Skipped machines remembered | Nothing forgotten |
| **End-of-location prompt** | "You have skipped machines. Stock now?" | Opportunity to complete |
| **Return to skipped** | "Go back to skipped" restarts machine | Complete at your pace |

---

## 9. ERROR HANDLING

### 9.1 Network Resilience
| Feature | How It Works | Benefit |
|---------|--------------|---------|
| **Offline banner** | Shows when connection lost | Clear status |
| **Auto-reconnect** | Retries automatically | Hands-free recovery |
| **Local state preservation** | IndexedDB stores state | No data loss |
| **PWA caching** | App shell cached | Fast reload |

### 9.2 Speech Recognition Recovery
| Feature | How It Works | Benefit |
|---------|--------------|---------|
| **Recognition restart** | Auto-restarts on errors | Self-healing |
| **Deepgram fallback** | Uses Deepgram on all platforms (works on iOS) | Universal compatibility |
| **Timeout handling** | 30-second API timeout with error message | Graceful degradation |

---

## 10. SECURITY & PRIVACY

### 10.1 Data Protection
| Feature | Implementation | Benefit |
|---------|----------------|---------|
| **Supabase Auth** | Industry-standard authentication | Secure user accounts |
| **Row-level security** | Users only see their data | Privacy guaranteed |
| **HTTPS everywhere** | All API calls encrypted | Secure transmission |
| **No raw API keys in client** | Cloudflare Worker proxies | Keys protected |

---

## Key Differentiators (Marketing Summary)

1. **True Hands-Free** - Zero screen interaction required during stocking
2. **iOS Compatible** - Deepgram STT works where Web Speech API fails
3. **~$0.13/Route** - Enterprise-grade AI at vending operator budget
4. **Instant Resume** - Pick up exactly where you left off
5. **Flexible Direction** - Top or bottom on each machine
6. **No Hardware** - Any smartphone + Bluetooth earbuds
7. **5-Minute Setup** - Upload PDF, start stocking
8. **Multi-Route Days** - Seamlessly chain routes together
9. **VMS Agnostic** - Works with Parlevel, Nayax, VendSoft exports
10. **Zero CapEx** - No $100k+ hardware investment like LightSpeed

---

## Target Market

### Primary: "The Missing Middle"
Mid-market vending operators (5-50 routes) who:
- Are too big for paper/spreadsheet tracking
- Are too small for $100k+ enterprise solutions
- Need voice-guided efficiency without hardware investment

### Market Size
- ~15,867 vending operators in US
- ~3,000 mid-market operators (target segment)
- 67% small (<$1M), 16% medium ($1-5M), 17% large ($5M+)

### Secondary: Partner/White-Label
VMS providers (Nayax, Parlevel, VendSoft) seeking:
- Voice layer add-on for existing customers
- Competitive response to LightSpeed
- 20% revenue share model

---

**END OF DOCUMENT**
