# StockerAI E2E Testing Requirements

## What Exists
- `__testInjectTranscript()` function in StockerApp.tsx (bypasses mic)
- Real user UUID: `bdc96b72-3f35-4cae-9e79-99473eb4a23b` (russ@visionairy.biz)
- SERVICE_ROLE_KEY in `.env`: `eyJhbGci...`
- Existing routes in database (North, South, etc.)

## What's Required for Automated Playwright Tests
1. **AI API Key** - Without this, all transcript commands fail silently
   - Need GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY
   - AI service is called for every voice command
2. **Python API running** - Backend must be accessible at `https://stockerai-api.onrender.com`
3. **Fresh route data** - Tests assume 4+ machines with 5 items each

## Session 73 "E2E Testing" Was MANUAL
- User personally tested with real voice on real device
- NOT automated Playwright tests
- Verified: 7 machines, 171 items, full route completion

## For Automated Tests
Either:
- **Option A**: Add AI API key to `.env` (costs money per test run)
- **Option B**: Mock all AI responses in tests (complex, brittle)
- **Option C**: Test only non-AI paths (limited coverage)

## Recommendation
**Skip automated E2E for small fixes like these**. Deploy and manually test instead.

The two fixes (pendingMachineTransition clearing + last-item notification) are simple enough to verify manually in < 5 minutes.
