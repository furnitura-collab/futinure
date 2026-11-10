# Bitta servis: API (Python, FastAPI) + admin panel (/admin/) + mobil ilovaning web versiyasi (/)

# 1) Web: admin panel va mobil web — Node'da yig'iladi, natijasi statik fayllar
FROM node:24-slim AS web
RUN npm i -g pnpm@12.16.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @mebel/admin... --filter @mebel/mobile...
RUN pnpm --filter @mebel/shared build
RUN cd apps/admin && ADMIN_BASE=/admin/ pnpm exec vite build --outDir /web/admin
RUN cd apps/mobile && EXPO_PUBLIC_API_URL=same-origin pnpm exec expo export --platform web --output-dir /web/app --max-workers 2

# 2) API
FROM python:3.14-slim
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/venv \
    PATH="/venv/bin:$PATH"
WORKDIR /app
COPY apps/api-py/pyproject.toml apps/api-py/uv.lock apps/api-py/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/api-py/ ./
COPY --from=web /web /web

ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIR=/web \
    UPLOAD_DIR=/data/uploads
EXPOSE 3000
CMD ["./scripts/start.sh"]
