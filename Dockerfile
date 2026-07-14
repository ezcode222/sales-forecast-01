FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ARG APP_BASE_PATH=/ugt-sales-forecast/nylon
ARG APP_BASE_URL=https://ugtweb.ube.co.th
ENV APP_BASE_PATH=${APP_BASE_PATH}
ENV APP_BASE_URL=${APP_BASE_URL}
ENV DATABASE_URL="sqlserver://127.0.0.1:1433;database=build;user=build;password=build;encrypt=true;trustServerCertificate=true"

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npm run db:generate

COPY . .
RUN npm run lint && npm run build:docker

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV API_PORT=3001

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
RUN DATABASE_URL="sqlserver://127.0.0.1:1433;database=build;user=build;password=build;encrypt=true;trustServerCertificate=true" npm ci --omit=dev \
  && DATABASE_URL="sqlserver://127.0.0.1:1433;database=build;user=build;password=build;encrypt=true;trustServerCertificate=true" npm run db:generate \
  && npm cache clean --force
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/server.js ./server.js

EXPOSE 3001

USER node

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && npm run start:prod"]
