# Static build of the web app, served by nginx.
# Build from the repository root: docker build -f deploy/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/renpy-formats/package.json packages/renpy-formats/
RUN pnpm install --frozen-lockfile --filter "@phanes/web..."
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/renpy-formats packages/renpy-formats
COPY apps/web apps/web
RUN pnpm --filter @phanes/web build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
