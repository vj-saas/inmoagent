FROM node:20-slim

# ffmpeg: conversión de audio (Fase 3). openssl/ca-certificates: requeridos por
# los engines de Prisma en Debian slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

# prisma migrate deploy aplica migraciones pendientes sin prompts interactivos (a diferencia de `migrate dev`).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
