# ── prod deps: production packages only ───────────────────────────────────────
FROM node:22-alpine AS deps-prod
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── all deps: dev + prod packages ─────────────────────────────────────────────
FROM node:22-alpine AS deps-all
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── dev: source is bind-mounted at runtime; nodemon watches for changes ───────
FROM node:22-alpine AS dev
WORKDIR /app
COPY --from=deps-all /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── prod: self-contained image ─────────────────────────────────────────────────
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=deps-prod /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY routes/ ./routes/
COPY public/ ./public/
COPY db/database.js ./db/
EXPOSE 3000
CMD ["npm", "start"]
