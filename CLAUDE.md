# CLAUDE.md

## Project Overview

Git Push Tracker is a self-hosted Node.js/TypeScript service that receives GitHub/GitLab push webhooks, generates AI summaries via Google Gemini, and exposes per-project REST APIs with isolated bearer tokens.

**Live**: https://git-tracker.dogmatech.co

## Commands

```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled JS from dist/
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run db:generate  # Generate Drizzle migrations
npm run db:push      # Push schema changes to DB
```

## Architecture

- **Monolith Express server** with SQLite-backed async queue
- Webhook → save raw push to SQLite → background worker (10s interval) → Gemini API → save summary
- Consumer API with per-project bearer tokens for team isolation
- Admin UI served as static HTML by Express (vanilla HTML/CSS/JS, no framework)
- Root `/` redirects to `/admin`

### Key Design Decisions

- **SQLite as job queue**: No Redis needed. `raw_pushes` table with `status` column acts as the queue. Worker polls every 10s.
- **Async processing**: Webhooks respond 202 immediately. Gemini calls happen in background worker. Retries are automatic (max 3 attempts).
- **API keys stored as raw + hash**: Raw keys are visible in the admin UI and copyable at any time. Hash is used for bearer auth lookup. This is a self-hosted tool — the admin owns the DB.
- **Express 5**: Uses Express 5 — `req.params` returns `string | string[]`, always cast with `as string`.
- **No revoke, just delete**: API keys are either active or deleted. No soft-revoke state.

## Code Conventions

- **Module system**: ESM (`"type": "module"` in package.json). Use `.js` extensions in imports.
- **ORM**: Drizzle ORM with better-sqlite3 driver. Schema in `src/db/schema.ts`.
- **No frontend framework**: Admin UI is vanilla HTML/CSS/JS in `src/admin/ui/index.html`. Uses DM Sans + JetBrains Mono fonts.
- **Factory pattern**: Each module exports a `create*` function (e.g., `createWebhookRouter(db)`, `createGeminiClient(apiKey, model)`).
- **Admin auth**: Frontend handles login via fetch + sessionStorage (no browser Basic Auth popup). API routes under `/admin/api` require Basic auth header. The HTML page at `/admin` is public (serves the login screen).

## File Layout

```
src/
├── index.ts          # Entry point — mounts routers, starts worker, serves /assets, redirects / → /admin
├── config.ts         # Env var parsing (loadConfig)
├── db/
│   ├── schema.ts     # Drizzle table definitions (projects, api_keys, raw_pushes, push_summaries)
│   └── index.ts      # SQLite connection + CREATE TABLE IF NOT EXISTS
├── webhooks/
│   ├── router.ts     # POST /webhooks/github|gitlab/:projectId
│   ├── github.ts     # GitHub payload parser + HMAC-SHA256 validation
│   └── gitlab.ts     # GitLab payload parser + token validation
├── api/
│   ├── router.ts     # GET /api/v1/pushes with pagination, branch/since filters
│   └── auth.ts       # Bearer token middleware (hash lookup)
├── admin/
│   ├── router.ts     # CRUD projects + API keys + GET logs
│   ├── auth.ts       # Basic auth middleware (no WWW-Authenticate header)
│   └── ui/
│       ├── index.html  # Full admin SPA (login + dashboard + docs panel + modals)
│       └── assets/     # logo.svg, favicon.svg, og-image.svg
├── worker/
│   └── index.ts      # Background processor (pending → Gemini → done/failed)
└── gemini/
    └── index.ts      # Gemini API client + prompt builder
```

## Admin UI Features

- Login screen with animated background
- Auto-detect provider + project name from pasted GitHub/GitLab URL
- API keys always visible with copy buttons (no one-time-only)
- Logs modal per project (last 3 AI summaries with colored chips)
- How to Connect modal per project (rendered HTML + copy as text/markdown)
- API Docs slide panel with full reference + copy as text/markdown
- Alert banner stays until user clicks X (no auto-dismiss)

## Environment Variables

Required: `GEMINI_API_KEY`, `ADMIN_USER`, `ADMIN_PASS`

See `.env.example` for all options with defaults.

## Deployment

- **Docker**: `docker compose up -d` — uses named volume `pushlog-data` for SQLite persistence
- **Coolify**: Must use **dockercompose** build pack (not dockerfile) so the named volume from `docker-compose.yml` is respected. The `dockerfile` build pack generates its own compose without volumes.
- Coolify app UUID: `k103q4i2ad8fiutx6l5x7vmq`
- Domain configured via `docker_compose_domains` API field with format `[{"name":"service-name","domain":"https://..."}]`
