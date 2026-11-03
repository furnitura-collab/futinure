# Bitta servis: API + admin panel (/admin/) + mobil ilovaning web versiyasi (/)
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm i -g pnpm@12.16.1
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @mebel/shared build \
  && DATABASE_URL=postgresql://build/x pnpm --filter @mebel/api exec prisma generate \
  && pnpm --filter @mebel/api build
RUN cd apps/admin && ADMIN_BASE=/admin/ pnpm exec vite build --outDir /web/admin
RUN cd apps/mobile && EXPO_PUBLIC_API_URL=same-origin pnpm exec expo export --platform web --output-dir /web/app

ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIR=/web \
    UPLOAD_DIR=/data/uploads
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["./scripts/start.sh"]
