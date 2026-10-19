# ---- deps: all npm packages, plus compilers in case better-sqlite3 must build from source
FROM node:24.22.0-bookworm-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci

# ---- stage 1: build the Vite frontend into web/dist
FROM deps AS web-build
COPY web web
RUN npm run build -w web

# ---- stage 2: compile the API, build cities.db, then drop development-only packages
FROM deps AS api-build
COPY api api
RUN npm run build -w api \
 && npm run cities -w api \
 && npm prune --omit=dev

# ---- final image: just Node, the compiled app and the data
FROM node:24.22.0-bookworm-slim
# The sqlite3 command-line tool is only here for the backup command in the README.
# `apt-get upgrade` brings in the security fixes Debian has released since the Node image
# was made. npm, yarn and corepack come with that image but the running app never uses
# them, so they are removed: less to go out of date.
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends sqlite3 \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && mkdir /data && chown node:node /data

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/jid-globe.db

WORKDIR /app
COPY --from=api-build /app/node_modules node_modules
COPY --from=api-build /app/api/package.json api/package.json
COPY --from=api-build /app/api/dist api/dist
COPY --from=api-build /app/api/migrations api/migrations
COPY --from=api-build /app/api/data/cities.db api/data/cities.db
COPY --from=web-build /app/web/dist web/dist

# Set by the release workflow to the git commit being built. It comes this late in the
# file so that a different commit doesn't cause any of the slow steps above to be redone.
ARG BUILD_COMMIT=dev
ENV BUILD_COMMIT=$BUILD_COMMIT

USER node
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "api/dist/server.js"]
