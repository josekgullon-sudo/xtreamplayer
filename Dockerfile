# TOTALplayer — imagen de producción multi-stage
FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Dependencias ----------
FROM base AS deps
# better-sqlite3 compila módulos nativos
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Build ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- Runtime ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Las listas y usuarios viven aquí: móntalo como volumen persistente
ENV DATA_DIR=/data

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /data && chown nextjs:nodejs /data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
# Sin instrucción VOLUME: el builder de Railway la rechaza. El volumen se
# monta desde la plataforma (Railway → Attach Volume → /data, o `docker run
# -v tp-data:/data` en un VPS); la ruta la fija la variable DATA_DIR.

CMD ["node", "server.js"]
