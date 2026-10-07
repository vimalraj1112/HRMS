# syntax=docker/dockerfile:1

# Build stage: full workspace install, Prisma client generation, server compile.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN npm ci

COPY server ./server
RUN npm run db:generate
RUN npm run build --workspace server

# Migrate stage: reuses the build image to run `prisma migrate deploy` + seed.
FROM build AS migrate

# Runtime stage: production dependencies only, no toolchain.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --workspace server

COPY server/prisma ./server/prisma
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/node_modules/@prisma/engines ./node_modules/@prisma/engines

RUN mkdir -p /data/uploads && chown -R node:node /app /data
USER node

EXPOSE 4000
CMD ["node", "server/dist/server.js"]
