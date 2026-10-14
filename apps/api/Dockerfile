# syntax=docker/dockerfile:1
# ── stage 1: install dependencies ────────────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /repo

# Enable corepack so pnpm is available
RUN corepack enable

# Copy only the files pnpm needs to resolve the workspace graph
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy every package.json in the workspace (needed for pnpm install --frozen-lockfile)
COPY apps/api/package.json          ./apps/api/
COPY apps/admin/package.json        ./apps/admin/ 2>/dev/null || true
COPY packages/                      ./packages/
COPY modules/                       ./modules/
COPY mobile-features/               ./mobile-features/ 2>/dev/null || true
COPY adapters/                      ./adapters/ 2>/dev/null || true
COPY tools/                         ./tools/ 2>/dev/null || true

# Install all deps (dev included — tsx is in devDependencies)
RUN pnpm install --frozen-lockfile

# ── stage 2: runner ───────────────────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /repo

RUN corepack enable

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 appuser

# Copy node_modules and workspace manifests from deps
COPY --from=deps /repo/node_modules         ./node_modules
COPY --from=deps /repo/package.json         ./package.json
COPY --from=deps /repo/pnpm-lock.yaml       ./pnpm-lock.yaml
COPY --from=deps /repo/pnpm-workspace.yaml  ./pnpm-workspace.yaml

# Copy source needed by tsconfig.run.json: apps/api + modules/* + packages/*
COPY apps/api/      ./apps/api/
COPY packages/      ./packages/
COPY modules/       ./modules/

# tsx is a devDep of @iraq-maps/api; install it globally so we get the bin
RUN npm install -g tsx@4.23.15

USER appuser

EXPOSE 3000

# tsx compiles TypeScript at runtime; tsconfig.run.json pulls in workspace sources
CMD ["tsx", "--tsconfig", "apps/api/tsconfig.run.json", "apps/api/src/main.ts"]
