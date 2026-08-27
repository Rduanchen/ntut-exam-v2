# Pinned, not floating. `node:20-alpine` resolves to the newest 20.x at build
# time, which satisfies the requirement today but records nothing. The backend
# needs Node >= 20.19 because p-limit@7 is ESM-only and is loaded from a
# CommonJS build via require(ESM), which lands in 20.19. Verified: works on
# 20.20.2, fails on 20.18.0 with ERR_REQUIRE_ESM -- a failure that surfaces at
# startup and looks nothing like its cause. See backend/package.json engines.
FROM node:22.23.2-alpine

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy necessary configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Pass VITE_BACKEND_URL for frontend build if needed
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL:-http://localhost:3000}

# Build both backend and frontend
RUN pnpm build
