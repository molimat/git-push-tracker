# Git Push Tracker

Self-hosted service that listens to GitHub/GitLab push webhooks, generates AI-powered summaries via Google Gemini, and exposes per-project REST APIs with isolated bearer tokens.

## Why?

When you work across multiple projects and teams, it's easy to forget to communicate deployments and changes. Git Push Tracker automates this by generating human-readable summaries of every push and exposing them via isolated APIs — each team only sees their own project's activity.

## Features

- Receives push webhooks from GitHub and GitLab
- AI-generated bullet point summaries via Google Gemini
- Per-project API endpoints with isolated bearer tokens
- Simple admin dashboard with basic auth
- SQLite database (zero external dependencies)
- Docker ready

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/molimat/git-push-tracker.git
cd git-push-tracker
cp .env.example .env
# Edit .env with your values
docker compose up -d
```

### Local

```bash
git clone https://github.com/molimat/git-push-tracker.git
cd git-push-tracker
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key |
| `ADMIN_USER` | Yes | - | Admin dashboard username |
| `ADMIN_PASS` | Yes | - | Admin dashboard password |
| `PORT` | No | `3000` | Server port |
| `DATABASE_PATH` | No | `./data/pushlog.db` | SQLite file path |
| `WORKER_INTERVAL_MS` | No | `10000` | Worker poll interval (ms) |
| `MAX_RETRY_ATTEMPTS` | No | `3` | Max Gemini retry attempts |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model to use |

## Usage

### 1. Create a project

Open the admin dashboard at `http://localhost:3000/admin` and add a project. You'll get a webhook URL and secret.

### 2. Configure webhook

In your GitHub/GitLab repository settings, add a webhook:
- **URL**: The webhook URL from step 1
- **Secret**: The webhook secret from step 1
- **Events**: Push events only

### 3. Generate an API key

In the admin dashboard, generate an API key for the project. Save it — it's only shown once.

### 4. Consume the API

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/v1/pushes
```

#### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `limit` | Results per page (max 100) | `?limit=10` |
| `offset` | Pagination offset | `?offset=20` |
| `branch` | Filter by branch | `?branch=main` |
| `since` | Filter by date (ISO 8601) | `?since=2024-01-01` |

#### Response

```json
{
  "project": "my-app",
  "pushes": [
    {
      "id": "uuid",
      "branch": "main",
      "author": "dev",
      "commitCount": 3,
      "summary": "- Added OAuth authentication endpoint\n- Fixed Redis connection timeout bug\n- Updated security dependencies",
      "pushedAt": "2024-01-15T10:30:00.000Z"
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
GitHub/GitLab → Webhook Handler → SQLite Queue → Background Worker → Gemini API
                                                                         ↓
                                              Team consumes via GET /api/v1/pushes
```

1. GitHub/GitLab sends push event → webhook handler validates secret, saves raw payload, responds 202
2. Background worker (every 10s) picks up pending pushes, calls Gemini, saves summary
3. Teams consume summaries via bearer-authenticated API endpoints

## Security

- Webhook secrets validated via HMAC-SHA256 (GitHub) / token (GitLab)
- API keys stored as SHA-256 hashes (raw key shown once at creation)
- Per-project bearer tokens ensure complete isolation between teams
- Admin dashboard protected by basic auth

## License

MIT
