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

### Local newsletter testbed

Run the sibling Lists project alongside this app. From `../lists`, start its Compose stack using
the port overrides in [its local development guide](https://github.com/jackharrhy/lists/blob/main/LOCAL_DEVELOPMENT.md). For example,
Lists can run at `http://localhost:18080` and its Mailpit inbox at `http://localhost:18025` while
Silicon Harbour runs at `http://localhost:3000` with `pnpm run dev`. Mailpit captures confirmation
and campaign messages; the local stack does not send real email.

Lists' local integration test covers subscriber API signup, confirmation, campaign creation and
editing, and Mailpit delivery. Silicon Harbour does not yet have a Lists client or newsletter UI,
so there is no cross-app browser test yet. When those are added, configure a server-side Lists URL
and scoped token for the local instance; keep the token out of browser code. Create a local
`lists.local` list in Lists, and reserve campaign sending for its admin UI.

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
| `LISTS_API_URL` | Lists server base URL (server only) | Unset |
| `LISTS_API_TOKEN` | Lists token for the Silicon Harbour list | Unset |
| `LISTS_LIST_SLUG` | Lists mailing list slug | `siliconharbour` |
| `LISTS_FROM_ADDRESS` | Campaign sender address | `hello@siliconharbour.dev` |
| `LISTS_PILOT_EMAILS` | Comma-separated addresses allowed for pilot sends | Unset |

## Newsletter development

Run Lists with its `compose.yml` (Mailpit captures outgoing mail at port 8025), create a list
named `Silicon Harbour` with slug `siliconharbour`, and create a member token assigned only to
that list. Give it `lists:read`, `subscribers:read`, `subscribers:write`, `campaigns:read`,
`campaigns:write`, and `campaigns:send` scopes. Point `LISTS_API_URL` at the local Lists app,
set `LISTS_API_TOKEN`, and use `LISTS_FROM_ADDRESS=news@lists.local` when the local Lists
sender domain is `lists.local`. Set `LISTS_PILOT_EMAILS` to test addresses captured by Mailpit.

The newsletter starts with public signup and full-list sending disabled. Admins can add pilot
subscribers, confirm through Mailpit, preview drafts, and use pilot send without enabling either
rollout setting. The token remains on the Silicon Harbour server. Production should use a
dedicated Lists member assigned only to this list.

## MCP access

The `search` and `query` MCP tools are public. OAuth is optional and enables the `execute` tool
for administrators with the `mcp:write` scope. The server uses the OAuth 2.1 authorization code
flow with S256 PKCE. MCP clients discover the OAuth endpoints from server metadata and open the
site's login and consent flow. Clients do not need a manually configured API key or shared secret.
