# ── deps ─────────────────────────────────────────────────────────────────────
# Pinned to immutable digest — update via Dependabot (docker ecosystem) or
# by running: docker pull node:20-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:20-alpine
FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ── builder ──────────────────────────────────────────────────────────────────
FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS builder
WORKDIR /app
# Build-time API URL injected by docker-compose (e.g. STAGING_API_URL).
# Declared here so the value is not silently dropped during the Next.js build.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runner ───────────────────────────────────────────────────────────────────
# Image size target: <300MB
FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN (getent group node || addgroup -S -g 1000 node) && (getent passwd node || adduser -S -u 1000 -G node node)
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
