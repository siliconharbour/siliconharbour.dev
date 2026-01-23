# siliconharbour.dev

https://siliconharbour.dev/about

## Tech Stack

- **Framework**: React Router v7 (full-stack SSR)
- **Database**: SQLite with Drizzle ORM
- **Styling**: Tailwind CSS v4

## Running Locally

### Prerequisites

- Node.js
- npm

### Development

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`

### Database Commands

```bash
npm run db:migrate    # Run migrations
npm run db:studio     # Open Drizzle Studio
npm run db:seed       # Seed database
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

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_DIR` | Directory for database and uploads | `./data` |
| `DB_NAME` | SQLite database filename | `siliconharbour.db` |
| `IMAGES_DIR_NAME` | Subdirectory for uploaded images | `images` |
