# Git Push Tracker

> Built entirely by AI (Claude Opus 4.6) — from spec to deploy in a single conversation.

Self-hosted service that turns your git pushes into AI-generated team updates. Connects to GitHub/GitLab via webhooks, summarizes changes with Google Gemini, and exposes per-project REST APIs with isolated bearer tokens.

## The Problem

You work across multiple projects and teams. You push code, deploy, move on — and forget to tell your team what changed. Standup comes and you're scrambling through git logs.

## The Solution

Git Push Tracker listens to every push across all your repos and generates human-readable bullet point summaries automatically. Each team gets their own API endpoint with an isolated bearer token — team A never sees team B's activity.

```
Push to GitHub/GitLab → Webhook → AI Summary → Team reads via API
```

## Features

- **AI-Powered Summaries** — Gemini 2.5 Flash Lite generates concise bullet points from your commits
- **Multi-Provider** — Supports both GitHub and GitLab webhooks
- **Team Isolation** — Per-project bearer tokens ensure complete data separation
- **Zero External Dependencies** — SQLite database, no Redis/Postgres required
- **Async Processing** — Webhooks respond instantly (202), AI processing happens in background
- **Admin Dashboard** — Login screen, project management, API key management with copy buttons, push logs, inline API docs
- **Smart URL Detection** — Paste a GitHub/GitLab URL and the provider + project name are auto-detected
- **Built-in API Docs** — Slide-out docs panel with code examples in curl, JavaScript, and Python, copyable as text or markdown
- **Per-Project "How to Connect"** — Each project card has a modal with its specific endpoint and code examples
- **Docker Ready** — Single image, named volume for persistence, deploy anywhere
- **Self-Hosted** — Your code stays on your infrastructure

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/molimat/git-push-tracker.git
cd git-push-tracker
cp .env.example .env
# Edit .env with your Gemini API key and admin credentials
docker compose up -d
```

### Local Development

```bash
git clone https://github.com/molimat/git-push-tracker.git
cd git-push-tracker
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

The admin dashboard will be available at `http://localhost:3000/admin`.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | [Google AI Studio](https://aistudio.google.com/apikey) API key |
| `ADMIN_USER` | Yes | - | Admin dashboard username |
| `ADMIN_PASS` | Yes | - | Admin dashboard password |
| `PORT` | No | `3000` | Server port |
| `DATABASE_PATH` | No | `./data/pushlog.db` | SQLite file path |
| `WORKER_INTERVAL_MS` | No | `10000` | Background worker poll interval (ms) |
| `MAX_RETRY_ATTEMPTS` | No | `3` | Max Gemini API retry attempts per push |
| `GEMINI_MODEL` | No | `gemini-2.5-flash-lite` | Gemini model to use |

## Usage

### 1. Create a project

Open the admin dashboard and paste a GitHub or GitLab repository URL. The provider and project name are auto-detected.

You'll receive a **webhook URL** and **webhook secret**.

### 2. Configure the webhook

In your repository settings:

**GitHub**: Settings → Webhooks → Add webhook
- **Payload URL**: The webhook URL from step 1
- **Content type**: `application/json`
- **Secret**: The webhook secret from step 1
- **Events**: Just the push event

**GitLab**: Settings → Webhooks → Add new webhook
- **URL**: The webhook URL from step 1
- **Secret token**: The webhook secret from step 1
- **Trigger**: Push events

### 3. Generate an API key

Click **+ Key** on your project card. API keys are always visible and copyable from the dashboard — no one-time-only restriction.

### 4. Consume the API

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-domain.com/api/v1/pushes
```

Each API key is scoped to a single project. A key from project A will never return data from project B.

### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `limit` | Results per page (default 20, max 100) | `?limit=10` |
| `offset` | Pagination offset | `?offset=20` |
| `branch` | Filter by branch name | `?branch=main` |
| `since` | Filter by date (ISO 8601) | `?since=2024-01-01` |

### Response Example

```json
{
  "project": "my-app",
  "pushes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "branch": "main",
      "author": "molimat",
      "commitCount": 3,
      "summary": "- Adicionou endpoint de autenticação via OAuth\n- Corrigiu bug de timeout na conexão com Redis\n- Atualizou dependências de segurança",
      "pushedAt": "2026-04-14T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 42
  }
}
```

## Architecture

```
┌─────────────┐     POST /webhooks/{provider}/{projectId}
│  GitHub      │──────────────────────────────────┐
│  GitLab      │──────────────────────────────────┤
└─────────────┘                                   │
                                       ┌──────────▼──────────┐
                                       │  Webhook Handler     │
                                       │  Validates secret    │
                                       │  Saves raw → SQLite  │
                                       │  Returns 202         │
                                       └──────────┬──────────┘
                                                  │
                                       ┌──────────▼──────────┐
                                       │  Background Worker   │
                                       │  Polls every 10s     │
                                       │  Calls Gemini API    │
                                       │  Saves summary       │
                                       └──────────┬──────────┘
                                                  │
                                       ┌──────────▼──────────┐
                                       │  REST API            │
                                       │  Bearer auth/project │
                                       │  GET /api/v1/pushes  │
                                       └─────────────────────┘
```

**Why async?** The webhook responds instantly (202) regardless of Gemini API latency. Failed AI calls retry automatically on the next worker cycle. No Redis or external queue needed — SQLite acts as the job queue.

## Project Structure

```
src/
├── index.ts              # Express app entry point, / → /admin redirect, /assets static
├── config.ts             # Environment variable parsing
├── db/
│   ├── schema.ts         # Drizzle ORM table definitions
│   └── index.ts          # SQLite connection + table creation
├── webhooks/
│   ├── router.ts         # POST /webhooks/github|gitlab/:projectId
│   ├── github.ts         # GitHub payload parser + HMAC validation
│   └── gitlab.ts         # GitLab payload parser + token validation
├── api/
│   ├── router.ts         # GET /api/v1/pushes with pagination + filters
│   └── auth.ts           # Bearer token middleware
├── admin/
│   ├── router.ts         # CRUD projects + API keys + logs endpoint
│   ├── auth.ts           # Basic auth middleware
│   └── ui/
│       ├── index.html    # Full admin SPA (login, dashboard, docs, modals)
│       └── assets/       # logo.svg, favicon.svg, og-image.svg
├── worker/
│   └── index.ts          # Background processor (pending → Gemini → done)
└── gemini/
    └── index.ts          # Gemini API client + prompt builder
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | SQLite via better-sqlite3 |
| ORM | Drizzle ORM |
| AI | Google Gemini 2.5 Flash Lite |
| Admin UI | Vanilla HTML/CSS/JS (DM Sans + JetBrains Mono) |
| Container | Docker (multi-stage build) |

## Security

- **Webhook validation** — HMAC-SHA256 for GitHub, secret token header for GitLab
- **API key storage** — Raw key stored for admin access, SHA-256 hash used for bearer auth lookup
- **Project isolation** — Each bearer token maps to exactly one project
- **Admin protection** — Basic auth via environment variables, frontend login screen (no browser popup)

## Deploy with Coolify

> **Important**: Use the **Docker Compose** build pack, not Dockerfile. The Docker Compose build pack respects the named volume in `docker-compose.yml`, ensuring your SQLite database persists between deploys.

1. Create a new project in Coolify
2. Add a new application → Public Repository → `https://github.com/molimat/git-push-tracker`
3. Set build pack to **Docker Compose**
4. Set Docker Compose location to `/docker-compose.yml`
5. Add environment variables (`GEMINI_API_KEY`, `ADMIN_USER`, `ADMIN_PASS`)
6. Configure domain in the compose service settings
7. Deploy

## Built With AI

This entire project — architecture design, code implementation, Docker setup, Coolify deployment, admin UI with login screen, API docs panel, and persistence debugging — was built in a single conversation with **Claude Opus 4.6**.

## License

MIT
