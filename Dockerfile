FROM node:20-alpine

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

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
