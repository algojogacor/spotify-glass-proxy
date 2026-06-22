# Build stage — needs devDependencies for TypeScript
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage — slim, production deps + yt-dlp + ffmpeg
FROM node:24-alpine
WORKDIR /app

# Install ffmpeg + python3 + pip (required by yt-dlp)
RUN apk add --no-cache ffmpeg curl python3 py3-pip

# Install yt-dlp via pip (more reliable on Alpine than standalone binary)
RUN pip3 install --break-system-packages --no-cache-dir yt-dlp

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
