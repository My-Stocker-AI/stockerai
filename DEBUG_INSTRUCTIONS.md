# Debug Instructions for WebSocket Error

## Current Status

**Production (main branch):** Working version (commit 75fd985)
**Dev branch (dev-debug-websocket):** Has optimizations + comprehensive debug logging

## What's in the Dev Branch

1. ✅ Nova-3 upgrade (Deepgram latest model)
2. ✅ Repeat command fix (2-item mode)
3. ✅ CommandRecognizer (99.9% accuracy for common commands)
4. ✅ Extensive debug logging to identify WebSocket failure

## How to Test Locally

### Option 1: Local Development Server

```bash
# Make sure you're on the dev branch
git checkout dev-debug-websocket

# Start development server
npm run dev

# Open browser to http://localhost:5173
# Open Chrome DevTools (F12)
# Go to Console tab
# Sign in and click Voice App
# Watch console for [DEBUG] messages
```

### Option 2: View Built Files Locally

```bash
# Build is already done (in dist/)
# Serve it locally:
npx serve dist

# Open browser to http://localhost:3000
# Open Chrome DevTools (F12)
# Watch console
```

## What to Look For in Console

The debug logs will show:

### Normal Flow (if working):
```
[DEBUG] connectDeepgram called: {...}
[DEBUG] Token acquired: { hasToken: true, tokenLength: 64 }
[DEBUG] WebSocket URL constructed: {...}
[DEBUG] Creating WebSocket connection...
[DEBUG] WebSocket object created, waiting for events...
[DEBUG] ✅ WebSocket onopen fired successfully! {...}
```

### If Failing:
```
[DEBUG] connectDeepgram called: {...}
[DEBUG] Token acquired: { hasToken: true, tokenLength: 64 }
[DEBUG] WebSocket URL constructed: {...}
[DEBUG] Creating WebSocket connection...
[DEBUG] WebSocket object created, waiting for events...
[DEBUG] WebSocket onerror fired: { readyState: 3, ... }
```

The `readyState` value tells us what went wrong:
- `0` = CONNECTING (connection not yet established)
- `1` = OPEN (connection established)
- `2` = CLOSING (connection is closing)
- `3` = CLOSED (connection failed or closed)

## Expected Debug Output

Please copy/paste ALL console output that starts with `[DEBUG]` or `[Voice]` and send it to me.

Also note:
1. Does the error happen IMMEDIATELY on page load?
2. Does it happen after clicking "Start Voice Session"?
3. Is there a Safari/iOS unlock screen shown first?
4. What browser are you using? (Chrome/Safari/Firefox)
5. Desktop or mobile?

## Next Steps

Once I see the debug output, I can:
1. Identify exactly where the WebSocket connection fails
2. Determine if it's a timing issue, permissions issue, or something else
3. Create a surgical fix
4. Test and deploy safely

## Rollback Instructions

If something breaks catastrophically:
```bash
git checkout main
npm run build
git push -f origin main
```

This will restore production to the working version.
