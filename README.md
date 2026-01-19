# Stocker AI

Voice-first inventory management system for vending machine route drivers.

## Project Info

**Production URL**: https://my-stocker-ai.com
**Repository**: https://github.com/VisionAIrySE/stockerai

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI**: shadcn-ui + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Deployment**: GitHub → Cloudflare Pages
- **Voice**: Deepgram WebSocket API
- **Workflows**: n8n (visionairy.app.n8n.cloud)

## Local Development

```sh
# Clone the repository
git clone https://github.com/VisionAIrySE/stockerai.git

# Navigate to the project directory
cd stockerai

# Install dependencies
npm install

# Start development server
npm run dev
```

## Deployment

Code is automatically deployed to Cloudflare Pages on push to `main` branch.

**Deployment Pipeline:**
1. Push to GitHub main branch
2. Cloudflare Pages detects change
3. Runs build: `npm run build`
4. Deploys to production

**Manual Deployment:**
```sh
# Build production bundle
npm run build

# Deploy manually via Cloudflare dashboard if needed
```

## Environment Variables

Required environment variables (configured in Cloudflare Pages):

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `VITE_N8N_BASE_URL` - n8n webhook base URL

## Documentation

- `/CLAUDE.md` - Complete project reference for AI assistants
- `/FUNCTIONALITY_TEST_CHECKLIST.md` - Testing protocol
- `/supabase/migrations/` - Database schema history

## Architecture

**Voice Flow:**
```
User Speech → Deepgram WebSocket → React Hook → n8n Workflow → Supabase → TTS Response
```

**Data Flow:**
```
PDF Upload → n8n Processing → Supabase Storage + Database → Voice Navigation
```

## Support

For issues or questions, see documentation in `/CLAUDE.md` or check git history.
