# ---- Hidden Object Hunt ----
# Single-image, self-contained build. All persistent state lives in
# /app/data (game + scoreboard) and /app/uploads (images) — map those to
# host volumes so nothing is lost when the container restarts.

FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Install only production dependencies (cached unless lockfile changes).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY server.js ./
COPY public ./public

# Persistent data locations (created at runtime by the app if empty).
RUN mkdir -p /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/api/game" >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
