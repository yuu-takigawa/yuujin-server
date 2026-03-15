# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine

WORKDIR /app

# Install all dependencies (egg-scripts is in devDeps but needed for production start)
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# Egg.js + TEGG requires full app/ directory structure at runtime
# (TEGG scans modules, middleware, models at startup)
COPY --from=builder /app/app ./app
COPY --from=builder /app/config ./config
COPY --from=builder /app/database ./database
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/typings ./typings

ENV NODE_ENV=production
ENV EGG_SERVER_ENV=prod

EXPOSE 7001

CMD ["npm", "start"]
