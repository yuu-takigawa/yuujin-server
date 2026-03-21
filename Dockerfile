# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy yuujin-prompts package (private, injected by CI/CD)
COPY yuujin-prompts/ ./yuujin-prompts/

# Compile yuujin-prompts TS → JS (so production runtime can require it)
RUN npm install -g typescript && tsc -p yuujin-prompts/tsconfig.json

# Install dependencies (rewrite local dep path for Docker context)
COPY package.json ./
RUN sed -i 's|file:../yuujin-prompts|file:./yuujin-prompts|g' package.json && npm install

# Copy source and build
COPY . .
RUN npm run build && \
    # Copy compiled JS back to source dirs so egg-scripts can find them
    cp -r dist/config/*.js config/ && \
    cp -r dist/app/ app-compiled/

# ---- Production Stage ----
FROM node:20-alpine

WORKDIR /app

# Copy compiled yuujin-prompts for runtime
COPY --from=builder /app/yuujin-prompts ./yuujin-prompts

# Install all dependencies (egg-scripts is in devDeps but needed for production start)
COPY package.json ./
RUN sed -i 's|file:../yuujin-prompts|file:./yuujin-prompts|g' package.json && \
    npm install && npm cache clean --force

# Egg.js + TEGG requires full app/ directory structure at runtime
COPY --from=builder /app/app ./app
COPY --from=builder /app/config ./config
# Overlay compiled JS files so egg-scripts loads them in production
COPY --from=builder /app/app-compiled/ ./app/
COPY --from=builder /app/database ./database
COPY --from=builder /app/scripts ./scripts
# Overlay compiled scripts JS
COPY --from=builder /app/dist/scripts/ ./scripts/
COPY --from=builder /app/typings ./typings

ENV NODE_ENV=production
ENV EGG_SERVER_ENV=prod

EXPOSE 7001

CMD ["npm", "start"]
