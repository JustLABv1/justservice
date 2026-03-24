# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend development (pnpm workspace)
pnpm dev          # Start all apps (Next.js with Turbopack)
pnpm build        # Build all packages/apps
pnpm lint         # Lint all packages/apps
pnpm typecheck    # Type-check all packages/apps
pnpm format       # Format all packages/apps

# Add a shadcn component (run from repo root)
pnpm dlx shadcn@latest add <component> -c apps/web

# Go API (from apps/api/)
go run ./cmd/server        # Run API server directly
go build -o bin/api ./cmd/server  # Build binary
go vet ./...               # Vet Go code

# Full local stack (PostgreSQL + API + web + example plugins)
docker-compose up          # Start all services
docker-compose up -d api   # Start only API + database
```

## Architecture

JustService is a self-service task execution platform. Users browse and run "tasks" (defined by plugins) through a web UI. The system uses RBAC for access control and supports both OIDC federation and local auth.

### Monorepo structure

**`apps/web`** — Next.js 16 app (App Router, React 19, Turbopack). Uses `@workspace/ui` for all shared UI. App-local code lives in `components/`, `hooks/`, and `lib/`. The `components/theme-provider.tsx` wraps the app with `next-themes` and wires a `d` hotkey for dark/light toggle.

**`apps/api`** — Go 1.26 REST + gRPC backend. HTTP on port 8080, gRPC on port 9090. Chi router, PostgreSQL via sqlx, zerolog for structured logging, viper for config.

**`packages/ui`** — Shared component library. All shadcn components land here (in `src/components/`). Tailwind CSS v4 is configured here — `src/styles/globals.css` is the single stylesheet imported by the app as `@workspace/ui/globals.css`.

**`plugins/`** — Go plugin binaries. Each plugin is a standalone gRPC server that registers itself with the API on startup. The `plugins/sdk/` package provides the base `Handler` interface.

### Frontend conventions

- All pages under `app/(main)/` require auth; `app/(auth)/` routes are public.
- `components/auth-provider.tsx` manages auth state via React context — exposes `useAuth()` for token, user, roles, and permission checks. Tokens live in memory only; session is restored via `/api/auth/refresh` on mount.
- `lib/api.ts` is the centralized API client. All typed request/response interfaces and endpoint functions live there.
- Every page component uses `"use client"` — there are no React Server Components in use.

**CSS/Tailwind:** Tailwind v4 scans both `apps/**` and `packages/ui/**` from the single `globals.css` in the UI package. There is no `tailwind.config.*` file — configuration is CSS-first.

**shadcn style:** `radix-nova` with `neutral` base color, CSS variables enabled, Lucide icons. Utility alias `utils` resolves to `@workspace/ui/lib/utils`.

**Path aliases (in `apps/web`):**
- `@/components` → `apps/web/components`
- `@/hooks` → `apps/web/hooks`
- `@/lib` → `apps/web/lib`
- `@workspace/ui/components/*` → shared shadcn components

### Go API structure

```
apps/api/
  cmd/server/main.go          # Entry point: config, DB migrate, wire services, start servers
  internal/
    config/                   # Viper config (env prefix: JUSTSERVICE_)
    auth/                     # JWT issuance, OIDC handlers, password hashing
    executor/                 # Task execution logic (sync + async modes)
    rbac/                     # Permission enforcement middleware
    admin/                    # Admin endpoints (users, plugins, roles, OIDC settings)
    plugin/                   # Plugin registry, gRPC client to plugins
    server/                   # HTTP router (chi) + gRPC server wiring
  migrations/                 # SQL migrations via golang-migrate (run on startup)
  proto/                      # Protobuf definitions for plugin gRPC protocol
```

Key dependencies: `chi/v5`, `sqlx`, `lib/pq`, `zerolog`, `viper`, `jwt/v5`, `go-oidc/v3`, `grpc`, `golang-migrate`.

### Plugin system

Plugins are standalone Go binaries that implement the `plugins/sdk` `Handler` interface. On startup each plugin connects to the API via gRPC and registers its task definitions (name, input JSON schema, sync/async flag, category). The API then routes execution requests back to the plugin.

- **Sync tasks**: API waits for `ExecuteSync` RPC response and returns result to caller.
- **Async tasks**: API calls `ExecuteAsync` RPC, plugin streams progress events, UI polls execution status.
- Task input schemas are JSONB in PostgreSQL and drive the form generation in the frontend.

See `plugins/hello-world/` and `plugins/webhook/` for reference implementations.

### Environment variables

The Go API uses viper with `JUSTSERVICE_` prefix. Required at runtime:

| Variable | Description |
|---|---|
| `JUSTSERVICE_DATABASE_DSN` | PostgreSQL connection string |
| `JUSTSERVICE_JWT_SECRET` | JWT signing secret (≥32 chars in production) |
| `NEXT_PUBLIC_API_URL` | API base URL baked into Next.js at build time |

Optional: `JUSTSERVICE_LOG_LEVEL` (info/debug/warn/error), `JUSTSERVICE_LOG_FORMAT` (json/pretty), `JUSTSERVICE_SERVER_PORT` (default 8080).

OIDC provider configuration is stored in the database and managed via the admin UI — no env vars needed.

### Database

PostgreSQL 17. Migrations run automatically on API startup via golang-migrate. Key tables: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `plugins`, `task_definitions`, `executions`, `audit_log`, `settings`, `oidc_providers`. All PKs are UUIDs. Task inputs/outputs stored as JSONB.
