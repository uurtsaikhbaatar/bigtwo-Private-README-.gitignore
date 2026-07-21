# Дай Ди — вэб хувилбар + WebSocket сервер нэг image дотор.
# Fly.io, Railway, Render, эсвэл ямар ч Docker дэмждэг газарт ажиллана.

# ── 1-р шат: вэб хувилбарыг бүтээх ──────────────────────────────────────────
# Expo-гийн зураг боловсруулах хэрэгслүүд glibc дээр найдвартай ажилладаг тул
# энэ шатанд alpine биш, slim (Debian) сонгосон.
FROM node:22-slim AS web
ENV CI=1 EXPO_NO_TELEMETRY=1
WORKDIR /src/app

COPY app/package.json app/package-lock.json ./
RUN npm ci

COPY app/ ./
RUN npm run build:web

# ── 2-р шат: ажиллах орчин ─────────────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /srv

COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev

COPY server/src ./server/src
# Сервер тоглоомын логикоо app/src/shared-ээс импортолдог.
COPY app/src/shared ./app/src/shared
COPY --from=web /src/app/dist ./app/dist

# PORT өгөгдөөгүй бол 8787 ашиглана (Railway, Render зэрэг нь өөрсдөө өгдөг).
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "--prefix", "server", "start"]
