# JSTACK on Dokploy — ADR-93, remap/DEPLOY_N8N.md.
#
# One container: the app's production web build, served by remap/deploy/server.mjs, which also puts
# HTTP Basic Auth on the whole site and forwards POST /n8n/<key> to n8n with the webhook auth header.
# Dokploy's Traefik gives it the domain and HTTPS; the container listens on plain HTTP, port 8080.
#
# Build-time arguments (public values only — they end up in the browser bundle):
#   EXPO_PUBLIC_N8N_RECORDS_NAMESPACE  a test corner of the records store, e.g. dashtest-deploy (empty: Josh's own)
#   EXPO_PUBLIC_TWENTY_APP_URL         Twenty's web address, for "open in Twenty" (empty: those links are hidden)
# Runtime environment (secrets — never build arguments): N8N_BASE, N8N_AUTH_HEADER, N8N_AUTH_VALUE,
# BASIC_AUTH_USER, BASIC_AUTH_PASSWORD (see remap/deploy/server.mjs).

# ── build ─────────────────────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1 EXPO_NO_TELEMETRY=1
RUN corepack enable
WORKDIR /src

# dependencies first, so a code change does not reinstall them (`prepare` runs install-hooks, which
# finds no .git and does nothing)
COPY jstack-app/package.json jstack-app/pnpm-lock.yaml jstack-app/.npmrc jstack-app/
COPY jstack-app/tools/install-hooks.mjs jstack-app/tools/
RUN cd jstack-app && pnpm install --frozen-lockfile

COPY jstack-app/ jstack-app/
COPY remap/dev-proxy.mjs remap/
COPY remap/deploy/ remap/deploy/

ARG EXPO_PUBLIC_N8N_RECORDS_NAMESPACE=""
ARG EXPO_PUBLIC_TWENTY_APP_URL=""
ENV EXPO_PUBLIC_DATA_SOURCE=n8n \
    EXPO_PUBLIC_N8N_BASE_URL=/n8n \
    EXPO_PUBLIC_N8N_RECORDS_NAMESPACE=${EXPO_PUBLIC_N8N_RECORDS_NAMESPACE} \
    EXPO_PUBLIC_TWENTY_APP_URL=${EXPO_PUBLIC_TWENTY_APP_URL} \
    JSTACK_PROD_DIST=/src/dist

# the production flavour (no test hook, the service worker on), then the bundle check: no n8n path,
# workflow name, test hook or dev address in anything a browser receives, and /n8n compiled in
RUN cd jstack-app && node tools/build-web.mjs --prod && node ../remap/deploy/bundle-check.mjs /src/dist

# ── run ───────────────────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 JSTACK_DIST=/srv/dist
WORKDIR /srv
COPY --from=build /src/dist /srv/dist
COPY --from=build /src/remap/dev-proxy.mjs /srv/remap/dev-proxy.mjs
COPY --from=build /src/remap/deploy/server.mjs /srv/remap/deploy/server.mjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "remap/deploy/server.mjs"]
