# MALG AI — production image for VPS (Oracle Always Free Ampere/AMD, Fly.io, ...).
# Build:  docker compose up -d --build   (reads values from .env)

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN npm i -g pnpm@12.3.4
# Note: no pnpm-lock.yaml in repo, so resolve fresh (deterministic enough for deploy).
COPY package.json pnpm-workspace.yaml ./
RUN pnpm install --no-frozen-lockfile

FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN npm i -g pnpm@12.3.4
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are inlined at build time — passed as build args (see docker-compose.yml).
ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
ARG NEXT_PUBLIC_FIREBASE_APP_ID=""
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN npm i -g pnpm@12.3.4 && useradd -m nextjs
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
RUN pnpm install --no-frozen-lockfile --prod
USER nextjs
EXPOSE 3000
# Direct node (not `pnpm start`): pnpm verifies deps before running scripts and
# aborts the container when the lockfile state disagrees (Render CI behavior).
CMD ["sh", "-c", "node ./node_modules/next/dist/bin/next start -p ${PORT:-3000} -H 0.0.0.0"]
