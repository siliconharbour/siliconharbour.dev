FROM node:25-alpine AS pnpm-base
RUN npm install -g pnpm@9

FROM pnpm-base AS development-dependencies-env
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
RUN pnpm install --frozen-lockfile
COPY . /app

FROM pnpm-base AS production-dependencies-env
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
RUN pnpm install --frozen-lockfile --prod

FROM pnpm-base AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN pnpm run build

FROM pnpm-base
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY ./app/assets /app/app/assets
COPY ./app/mcp /app/app/mcp
COPY ./app/lib /app/app/lib
COPY ./app/db /app/app/db
COPY ./public /app/public
COPY server.ts /app/server.ts
COPY tsconfig.json /app/tsconfig.json
WORKDIR /app
# Required env vars:
# MCP_API_TOKEN=<random secret> — required for execute tool authentication
# Generate with: openssl rand -hex 32
CMD ["pnpm", "run", "start"]
