FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV DB_DIR=/data/database
ENV BACKUPS_DIR=/data/backups
ENV IMPORTS_DIR=/data/imports
ENV MAX_BACKUPS=60

RUN mkdir -p /data/database /data/backups /data/imports && chown -R node:node /data

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000
USER node
CMD ["npm", "run", "start"]
