# CLAUDE.md

## Project Overview

Git Push Tracker is a self-hosted Node.js/TypeScript service that receives GitHub/GitLab push webhooks, generates AI summaries via Google Gemini, and exposes per-project REST APIs with isolated bearer tokens.

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
- Admin UI served as static HTML by Express

### Key Design Decisions

- **SQLite as job queue**: No Redis needed. `raw_pushes` table with `status` column acts as the queue. Worker polls every 10s.
- **Async processing**: Webhooks respond 202 immediately. Gemini calls happen in background worker. Retries are automatic (max 3 attempts).
- **API key hashing**: Raw keys shown once at creation, stored as SHA-256 hashes. Never log or expose raw keys.
- **Express 5**: Uses Express 5 — `req.params` returns `string | string[]`, always cast with `as string`.

## Code Conventions

- **Module system**: ESM (`"type": "module"` in package.json). Use `.js` extensions in imports.
- **ORM**: Drizzle ORM with better-sqlite3 driver. Schema in `src/db/schema.ts`.
- **No frontend framework**: Admin UI is vanilla HTML/CSS/JS in `src/admin/ui/index.html`.
- **Factory pattern**: Each module exports a `create*` function (e.g., `createWebhookRouter(db)`, `createGeminiClient(apiKey, model)`).

## File Layout

```
src/
├── index.ts          # Entry point — mounts routers, starts worker
├── config.ts         # Env var parsing (loadConfig)
├── db/               # Schema + connection
├── webhooks/         # GitHub/GitLab handlers
├── api/              # Consumer API (bearer auth)
├── admin/            # Admin CRUD + UI
├── worker/           # Background push processor
└── gemini/           # Gemini API client
```

## Environment Variables

Required: `GEMINI_API_KEY`, `ADMIN_USER`, `ADMIN_PASS`

See `.env.example` for all options with defaults.

## Testing

Tests use vitest. Run `npm test` before committing. Test files live in `tests/` mirroring `src/` structure.

## Deployment

- **Docker**: `docker compose up -d` — single service with SQLite volume
- **Coolify**: Public repo, Dockerfile build pack, set env vars, deploy
- App UUID in Coolify: `f87gsuzc1jyd7k11q3m3l2j8`
