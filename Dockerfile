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

# Install ffmpeg (required by yt-dlp for audio extraction)
RUN apk add --no-cache ffmpeg curl

# Download yt-dlp binary from official GitHub release
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
