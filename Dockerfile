FROM node:26.8.1-alpine AS package-manager-base
RUN npm install -g npm@12.0.2 pnpm@11.14.0

FROM package-manager-base AS dependency-base
RUN apk add --no-cache python3 make g++

FROM dependency-base AS development-dependencies-env
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
RUN pnpm install --frozen-lockfile
COPY . /app

FROM dependency-base AS production-dependencies-env
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
RUN pnpm install --frozen-lockfile --prod

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
COPY ./app/lib /app/app/lib
COPY ./app/db /app/app/db
COPY ./public /app/public
COPY server.ts /app/server.ts
COPY tsconfig.json /app/tsconfig.json
WORKDIR /app
# Required env vars:
# SESSION_SECRET=<random secret> — signs login and OAuth consent sessions
# SITE_URL=https://siliconharbour.dev — public application and MCP resource URL
# OAUTH_ISSUER_URL=https://siliconharbour.dev — optional when identical to SITE_URL
CMD ["pnpm", "run", "start"]
