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

Run Tea's Lists app with disposable storage and Mailpit using its
`apps/lists/LOCAL_DEVELOPMENT.md` guide. Lists can run at `http://localhost:18080` and Mailpit
at `http://localhost:18025`, alongside Silicon Harbour at `http://localhost:3000`.
Use an isolated machine identity and list fixture; never point sending tests at production.

The server-side client and `/manage/newsletter` UI use the Lists REST API. The provider's local
integration suite covers signup, confirmation, campaign editing and captured delivery. The
consumer's token, list-ownership and rollout tests use mocked HTTP and send no mail:

```bash
pnpm test test/lib/newsletter-auth.test.ts test/lib/newsletter.test.ts test/operations/newsletter-create.test.ts
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

| Variable                   | Description                                       | Default                    |
| -------------------------- | ------------------------------------------------- | -------------------------- |
| `DATA_DIR`                 | Directory for database and uploads                | `./data`                   |
| `DB_NAME`                  | SQLite database filename                          | `siliconharbour.db`        |
| `IMAGES_DIR_NAME`          | Subdirectory for uploaded images                  | `images`                   |
| `SESSION_SECRET`           | Signs login and OAuth sessions                    | Required in prod           |
| `SITE_URL`                 | Public application/MCP resource URL               | Production URL             |
| `OAUTH_ISSUER_URL`         | OAuth issuer URL (if different)                   | `SITE_URL`                 |
| `LISTS_API_URL`            | Lists server base URL (server only)               | Unset                      |
| `LISTS_AUTH_ISSUER`        | HTTPS issuer for the newsletter machine identity  | Unset                      |
| `LISTS_AUTH_CLIENT_ID`     | Dedicated newsletter machine client ID            | Unset                      |
| `LISTS_AUTH_CLIENT_SECRET` | Server-only machine client secret                 | Unset                      |
| `LISTS_AUTH_SCOPE`         | Exact reviewed audience and permission scopes     | Unset                      |
| `LISTS_LIST_SLUG`          | Lists mailing list slug                           | `siliconharbour`           |
| `LISTS_FROM_ADDRESS`       | Campaign sender address                           | `hello@siliconharbour.dev` |
| `LISTS_PILOT_EMAILS`       | Comma-separated addresses allowed for pilot sends | Unset                      |

## Newsletter development

The newsletter uses a dedicated machine identity restricted to the Silicon Harbour list.
Its six REST permissions are `lists:read`, `subscribers:read`, `subscribers:write`,
`campaigns:read`, `campaigns:write`, and `campaigns:send`. Auth supplies the exact issuer,
client credential and scope string, including the project audience and member role. These
values stay on the server. Do not request browser, MCP, refresh, admin or other-list access.

Set `LISTS_API_URL` to Tea's Lists origin. The client discovers a same-origin HTTPS token
endpoint, uses `client_credentials` with `client_secret_basic`, and caches the token in memory
until shortly before its returned expiry. Concurrent exchanges share one request. Authorization
rejections discard the cached token; writes and sends are never automatically replayed.
There is no static-token or owner-credential fallback. Coordinate secret rotation through Auth
and reload the consumer with the replacement; do not assume existing access tokens are revoked
by replacing a client secret.

For isolated local delivery, use `LISTS_FROM_ADDRESS=news@lists.local` when the provider's sender
domain is `lists.local`, and put only captured test addresses in `LISTS_PILOT_EMAILS`.
Public signup and full-list sending start disabled. Admins can add pilot subscribers, confirm
through Mailpit, preview drafts and use pilot send without enabling either rollout setting.

The Lists-to-Tea cutover must keep source credentials and routing unchanged until the replacement
issuer/resource and isolated newsletter workflows pass acceptance. Preserve list, subscriber and
campaign IDs, the sender, pilot allowlist and rollout flags. Shared deployment changes belong to
the Infra owner; revoke the old source credential only after the consumer is accepted.

## MCP access

The `search` and `query` MCP tools are public. OAuth is optional and enables the `execute` tool
for administrators with the `mcp:write` scope. The server uses the OAuth 2.1 authorization code
flow with S256 PKCE. MCP clients discover the OAuth endpoints from server metadata and open the
site's login and consent flow. Clients do not need a manually configured API key or shared secret.

## SQLite and production migrations

Connections explicitly enable foreign keys, use WAL and full synchronous durability,
and wait up to five seconds for a lock. Migration connections wait up to 30 seconds.
Read-only tooling does not change the database's journal mode.

`pnpm run db:migrate` applies reviewed SQL locally. `DB_URL` selects the file for
both the app and tooling; otherwise they use `DATA_DIR`/`DB_NAME`.

For a production release, publish the runtime image, then run:

```sh
pnpm run migrate-prod
# Or pin the release:
pnpm run migrate-prod --image ghcr.io/siliconharbour/siliconharbour.dev@sha256:<digest>
```

The command shows the image ID/revision for confirmation and runs the image's
packaged migrations on Mug against the current data volume, with networking disabled
and no application credentials. It does not stop or reload the website, pull the DB
locally, or push a replacement file. Deploy the corresponding application release
separately after successful migration. Nothing runs automatically at app startup.

Before pending SQL runs, SQLite's backup API creates a private, verified standalone
copy under the production volume's `backups/` directory. Keep these recovery points;
there is no automatic retention or restore. All pending SQL and journal entries
commit together under an immediate transaction after foreign-key and quick checks.
An error leaves that transaction unapplied and reports the retained backup path.
A lost SSH connection can leave an uncertain outcome: inspect the migration journal
and any running migration container before issuing another command.

WAL keeps reads available while a migration writes, but only one writer can commit
at a time. Long migrations can delay or fail writes; synchronous lock waits can also
delay HTTP handling. Review compatibility with the
running release; destructive changes and large rebuilds still need staging or a
maintenance window. Follow SQLite's local-filesystem requirement for WAL.

The data-editing flow is retained: `pnpm run sync-prod` pulls a consistent database
snapshot and assets; `pnpm run push-prod-db` takes a backup, stops the application,
and replaces its database with a standalone local snapshot. Close local database
connections before pulling. `pnpm run backup-prod` also snapshots the database
rather than copying a live `.db` file without its WAL.
