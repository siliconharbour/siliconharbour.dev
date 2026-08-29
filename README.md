# siliconharbour.dev

https://siliconharbour.dev/about

## Tech Stack

- **Framework**: React Router v7 (full-stack SSR)
- **Database**: SQLite with Drizzle ORM
- **Styling**: Tailwind CSS v4

## Running Locally

### Prerequisites

- Node.js
- pnpm

### Development

```bash
pnpm install
pnpm run dev
```

App runs at `http://localhost:3000`

### Database Commands

```bash
pnpm run db:migrate    # Run migrations
pnpm run db:studio     # Open Drizzle Studio
pnpm run db:seed       # Seed database
```

## Docker

### Using Docker Compose (Recommended)

```bash
docker compose up --build
```

App runs at `http://localhost:3000`

Data is persisted to `./data/docker/`.

### Manual Docker Build

```bash
docker build -t siliconharbour .
docker run -p 3000:3000 -v ./data:/app/data siliconharbour
```

## Environment Variables

| Variable          | Description                        | Default             |
| ----------------- | ---------------------------------- | ------------------- |
| `DATA_DIR`        | Directory for database and uploads | `./data`            |
| `DB_NAME`         | SQLite database filename           | `siliconharbour.db` |
| `IMAGES_DIR_NAME` | Subdirectory for uploaded images   | `images`            |
| `SESSION_SECRET`  | Signs login and OAuth sessions      | Required in prod    |
| `SITE_URL`        | Public application/MCP resource URL | Production URL      |
| `OAUTH_ISSUER_URL` | OAuth issuer URL (if different)    | `SITE_URL`          |

## MCP access

The `search` and `query` MCP tools are public. OAuth is optional and enables the `execute` tool
for administrators with the `mcp:write` scope. The server uses the OAuth 2.1 authorization code
flow with S256 PKCE. MCP clients discover the OAuth endpoints from server metadata and open the
site's login and consent flow. Clients do not need a manually configured API key or shared secret.
