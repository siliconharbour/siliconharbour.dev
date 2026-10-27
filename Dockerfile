FROM platformatic/node-caged:26-slim AS package-manager-base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.15.0

FROM package-manager-base AS dependency-base
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM dependency-base AS development-dependencies-env
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
RUN npm_config_build_from_source=true npm_config_nodedir=/usr/local MAKEFLAGS=-j2 pnpm install --frozen-lockfile
COPY . /app

FROM dependency-base AS production-dependencies-env
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
RUN npm_config_build_from_source=true npm_config_nodedir=/usr/local MAKEFLAGS=-j2 pnpm install --frozen-lockfile --prod

FROM package-manager-base AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN pnpm run build

FROM package-manager-base
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY ./app/assets /app/app/assets
COPY ./app/content /app/app/content
COPY ./app/mcp /app/app/mcp
COPY ./app/operations /app/app/operations
COPY ./app/lib /app/app/lib
COPY ./app/theme /app/app/theme
COPY ./app/db /app/app/db
COPY ./public /app/public
COPY server.ts /app/server.ts
COPY tsconfig.json /app/tsconfig.json
WORKDIR /app
RUN node --input-type=module -e "\
    import assert from 'node:assert/strict'; \
    import Database from 'better-sqlite3'; \
    import bcrypt from 'bcrypt'; \
    import sharp from 'sharp'; \
    assert.equal(process.versions.node.split('.')[0], '26'); \
    assert.equal(process.config.variables.v8_enable_pointer_compression, 1); \
    const db = new Database(':memory:'); \
    db.exec('CREATE TABLE probe (value TEXT); INSERT INTO probe VALUES (char(111,107))'); \
    assert.equal(db.prepare('SELECT value FROM probe').get().value, 'ok'); db.close(); \
    assert(bcrypt.compareSync('probe', bcrypt.hashSync('probe', 4))); \
    const png = await sharp({create:{width:1,height:1,channels:3,background:'white'}}).png().toBuffer(); \
    assert.equal((await sharp(png).metadata()).width, 1); \
    console.log('Node 26 pointer compression, SQLite, bcrypt and sharp passed');"
RUN DATA_DIR=/tmp/image-smoke-check NODE_ENV=production SESSION_SECRET=image-build-smoke-check \
    node --import tsx --input-type=module -e "await import('./app/mcp/http-app.ts'); await import('./build/server/index.js')" \
    && rm -rf /tmp/image-smoke-check
# Required env vars:
# SESSION_SECRET=<random secret> — signs login and OAuth consent sessions
# SITE_URL=https://siliconharbour.dev — public application and MCP resource URL
# OAUTH_ISSUER_URL=https://siliconharbour.dev — optional when identical to SITE_URL
CMD ["pnpm", "run", "start"]
