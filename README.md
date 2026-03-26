# JustService

A self-service task execution portal. Users browse and run **tasks** defined by plugins through a web UI, with full RBAC access control and support for both OIDC federation and local authentication.

---

## Project structure

```
justservice/
├── apps/
│   ├── api/                    # Go REST + gRPC backend
│   │   ├── cmd/server/         # Entry point (main.go)
│   │   ├── internal/
│   │   │   ├── admin/          # Admin endpoints (users, plugins, roles, OIDC)
│   │   │   ├── auth/           # JWT issuance, OIDC handlers, password hashing
│   │   │   ├── config/         # Viper config (JUSTSERVICE_ env prefix)
│   │   │   ├── db/             # sqlx + golang-migrate
│   │   │   ├── executor/       # Task execution logic (sync + async)
│   │   │   ├── plugin/         # Plugin registry, gRPC server, health monitor
│   │   │   ├── rbac/           # Permission middleware
│   │   │   └── server/         # Chi HTTP router wiring
│   │   ├── migrations/         # SQL migrations (run automatically on startup)
│   │   ├── proto/              # Protobuf definitions for the plugin gRPC protocol
│   │   └── config.example.yaml # Annotated example configuration file
│   └── web/                    # Next.js 16 frontend (App Router, React 19)
│       ├── app/
│       │   ├── (auth)/         # Public routes: /login, /register
│       │   └── (main)/         # Protected routes (require auth)
│       ├── components/         # App-local components (auth-provider, main-layout…)
│       ├── hooks/              # Custom React hooks
│       ├── lib/api.ts          # Centralized typed API client
│       └── proxy.ts            # Edge proxy: session-cookie-based auth routing
├── plugins/                    # Plugin binaries (standalone gRPC servers)
│   ├── sdk/                    # Go SDK for building plugins
│   ├── hello-world/            # Example sync plugin
│   └── webhook/                # Example async plugin
└── deploy/
    ├── docker/
    │   └── plugin.Dockerfile   # Generic multi-stage Dockerfile for plugins
    └── helm/justservice/       # Helm chart for Kubernetes deployment
```

---

## Quick start (local development)

### Prerequisites

- **Go** ≥ 1.22
- **Node.js** ≥ 20 with **pnpm** ≥ 9
- **PostgreSQL** 15+ (or Docker)

### 1. Start PostgreSQL

```bash
docker run -d \
  --name justservice-db \
  -e POSTGRES_USER=justservice \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=justservice \
  -p 5432:5432 \
  postgres:17-alpine
```

### 2. Configure the API

```bash
cp apps/api/config.example.yaml apps/api/config.yaml
# Edit apps/api/config.yaml — at minimum set database.dsn and jwt.secret
```

Or set environment variables directly (they override the config file):

```bash
export JUSTSERVICE_DATABASE_DSN="postgres://justservice:changeme@localhost:5432/justservice?sslmode=disable"
export JUSTSERVICE_JWT_SECRET="a-very-long-random-secret-at-least-32-chars"
```

### 3. Run the API

```bash
cd apps/api
go run ./cmd/server
# HTTP on :8080, gRPC (plugin registration) on :9090
# Migrations run automatically on startup
```

### 4. Run the frontend

```bash
# From the repo root
pnpm install
NEXT_PUBLIC_API_URL=http://localhost:8080 pnpm dev
# Web UI on http://localhost:3000
```

### 5. Full stack with Docker Compose

```bash
docker-compose up
# postgres + api + web + hello-world plugin + webhook plugin
```

---

## Configuration reference

All options can be set via `apps/api/config.yaml` **or** as environment variables using the `JUSTSERVICE_` prefix (e.g. `server.port` → `JUSTSERVICE_SERVER_PORT`). Environment variables take precedence.

| Config key | Env variable | Default | Description |
|---|---|---|---|
| `server.host` | `JUSTSERVICE_SERVER_HOST` | `0.0.0.0` | HTTP bind address |
| `server.port` | `JUSTSERVICE_SERVER_PORT` | `8080` | HTTP port |
| `database.dsn` | `JUSTSERVICE_DATABASE_DSN` | — | **Required.** PostgreSQL connection string |
| `database.migrations_path` | `JUSTSERVICE_DATABASE_MIGRATIONS_PATH` | `file://migrations` | Path for golang-migrate |
| `jwt.secret` | `JUSTSERVICE_JWT_SECRET` | — | **Required.** JWT signing secret (≥ 32 chars in production) |
| `jwt.access_token_ttl` | `JUSTSERVICE_JWT_ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `jwt.refresh_token_ttl` | `JUSTSERVICE_JWT_REFRESH_TOKEN_TTL` | `168h` | Refresh cookie lifetime |
| `grpc.host` | `JUSTSERVICE_GRPC_HOST` | `0.0.0.0` | gRPC bind address |
| `grpc.port` | `JUSTSERVICE_GRPC_PORT` | `9090` | gRPC plugin-registration port |
| `log.level` | `JUSTSERVICE_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `log.format` | `JUSTSERVICE_LOG_FORMAT` | `json` | `json` \| `console` |
| `oidc.public_base_url` | `JUSTSERVICE_OIDC_PUBLIC_BASE_URL` | `""` | Public browser-facing base URL used for OIDC callback URLs |

Frontend variable (baked in at build time):

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the Go API, e.g. `http://localhost:8080` |

---

## Authentication

JustService supports two authentication methods.

### Local auth

Users are created by an admin in the admin panel (or via `/register`). Passwords are bcrypt-hashed. On login the API returns:

- A short-lived **access token** (JWT Bearer) stored **in memory only** — never in localStorage
- A long-lived **httpOnly refresh cookie** (`refresh_token`) used to silently renew sessions on page load

### OIDC federation

OIDC providers (e.g. Google, Okta, Keycloak, Azure AD) are stored in the database and loaded at startup. There are now two supported ways to manage them:

- Configure providers through the admin API/UI.
- Bootstrap providers declaratively at API startup with `oidc.bootstrap_providers` or `JUSTSERVICE_OIDC_BOOTSTRAP_PROVIDERS_JSON`.

When the Next.js web app fronts the API, set `oidc.public_base_url` to the web origin so callback URLs resolve to paths like `https://justservice.example.com/api/auth/oidc/<provider-id>/callback`.

Helm exposes this under `config.oidc.publicBaseUrl`. For bootstrap data, prefer `config.oidc.existingProvidersSecret` so the provider JSON, including `client_secret`, comes from an existing Kubernetes Secret rather than committed chart values. `config.oidc.providers` remains available for local or ephemeral environments, but it is not a good place to commit production secrets.

When using `existingProvidersSecret`, create a Secret whose `oidc-bootstrap-providers.json` value is a JSON array of provider objects. The API reads that through `JUSTSERVICE_OIDC_BOOTSTRAP_PROVIDERS_JSON`, and provider entries are still upserted by name on startup.

---

## Plugin system

Plugins are standalone Go binaries that register themselves with the API on startup and serve task execution requests over gRPC.

### How it works

1. The plugin starts a gRPC server implementing `TaskExecutorService`
2. It calls `PluginService.Register` on the API's gRPC address (`0.0.0.0:9090` by default), sending its listen address and a list of task definitions  
3. The API stores the plugin and its tasks in the database and routes execution requests back to the plugin
4. The plugin returns results (sync) or streams `TaskProgress` events (async)
5. The API runs a health monitor that periodically pings plugins and marks them offline if unresponsive

### Task types

| Type | Description |
|---|---|
| **Sync** | API waits for `ExecuteSync` RPC response and returns result immediately |
| **Async** | API calls `ExecuteAsync` RPC; plugin streams progress events; UI polls for status |

### Writing a plugin with the SDK

The `plugins/sdk` package handles all the boilerplate (gRPC server, registration, heartbeat loop).

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/justlab/justservice/plugins/sdk"
)

type greetTask struct{}

func (greetTask) Definition() sdk.TaskDefinition {
    return sdk.TaskDefinition{
        Name:        "Greet",
        Slug:        "greet",            // unique, URL-safe identifier
        Description: "Returns a greeting.",
        Category:    "demos",
        IsSync:      true,
        InputSchema: map[string]any{     // JSON Schema — drives the form UI
            "type":     "object",
            "required": []string{"name"},
            "properties": map[string]any{
                "name": map[string]any{"type": "string", "title": "Name"},
            },
        },
    }
}

func (greetTask) Execute(_ context.Context, ec sdk.ExecuteContext) (any, error) {
    name, _ := ec.Input["name"].(string)
    return map[string]any{"message": fmt.Sprintf("Hello, %s!", name)}, nil
}

func main() {
    p := &sdk.Plugin{
        Name:        "greet-plugin",
        Version:     "1.0.0",
        GRPCAddr:    sdk.EnvOrDefault("GRPC_ADDR", "0.0.0.0:9001"),
        BackendAddr: sdk.EnvOrDefault("BACKEND_GRPC_ADDR", "localhost:9090"),
    }
    p.Register(greetTask{})
    if err := p.Run(); err != nil {
        log.Fatal(err)
    }
}
```

For **async tasks**, implement `sdk.AsyncHandler` by adding `ExecuteAsync`:

```go
func (t myTask) ExecuteAsync(ctx context.Context, ec sdk.ExecuteContext, progress chan<- sdk.AsyncProgress) {
    progress <- sdk.AsyncProgress{Pct: 10, Message: "Starting…"}
    // do work…
    progress <- sdk.AsyncProgress{Pct: 100, Output: map[string]any{"result": "done"}}
    // Returning an sdk.AsyncProgress with a non-empty Err field signals failure:
    // progress <- sdk.AsyncProgress{Err: "something went wrong"}
}
```

### `sdk.ExecuteContext` fields

| Field | Type | Description |
|---|---|---|
| `ExecutionID` | `string` | Unique ID of this execution |
| `TaskSlug` | `string` | Slug of the task being executed |
| `Input` | `map[string]any` | Parsed task input from the UI form |
| `UserID` | `string` | UUID of the requesting user |
| `Username` | `string` | Username |
| `Email` | `string` | User's email |
| `Roles` | `[]string` | User's assigned roles |

### Plugin environment variables

| Variable | Default | Description |
|---|---|---|
| `GRPC_ADDR` | `0.0.0.0:9001` | Address the plugin's gRPC server listens on |
| `ADVERTISE_ADDR` | `GRPC_ADDR` | Address registered at the backend so it can call the plugin |
| `BACKEND_GRPC_ADDR` | `localhost:9090` | Address of the API's gRPC plugin endpoint |

Run the included example plugins:

```bash
# Terminal 1 — ensure the API is already running
cd plugins && go run ./hello-world    # listens on :9001

# Terminal 2
cd plugins && go run ./webhook        # listens on :9002
```

---

## Deployment

### Docker Compose

```bash
cp apps/api/config.example.yaml apps/api/config.yaml
docker-compose up --build
```

Services: `postgres`, `api` (`:8080` / `:9090`), `web` (`:3000`), `hello-world` plugin, `webhook` plugin.

### Kubernetes (Helm)

```bash
helm install justservice ./deploy/helm/justservice \
  --set config.jwtSecret="<your-secret>" \
  --set web.apiUrl="https://api.yourdomain.com" \
  --set ingress.enabled=true \
    --set ingress.hosts[0].host="yourdomain.com"
```

When `postgresql.enabled=false`, also set `database.dsn`.

Plugins are deployed as separate workloads. By default, `hello-world` and `webhook` are enabled, while `garage` is disabled until its admin credentials are wired.

Example enabling the Garage plugin:

```bash
helm upgrade --install justservice ./deploy/helm/justservice \
    --set config.jwtSecret="<your-secret>" \
    --set plugins.garage.enabled=true \
    --set plugins.garage.env[0].name=GARAGE_ADMIN_URL \
    --set plugins.garage.env[0].value="https://garage-admin.example.com" \
    --set plugins.garage.env[1].name=GARAGE_S3_ENDPOINT \
    --set plugins.garage.env[1].value="https://garage.example.com" \
    --set plugins.garage.secretEnv[0].name=GARAGE_ADMIN_TOKEN \
    --set plugins.garage.secretEnv[0].secretName=garage-plugin \
    --set plugins.garage.secretEnv[0].secretKey=admin-token
```

`GARAGE_S3_ENDPOINT` should point to the user-reachable S3 endpoint, not the internal admin API. The Garage plugin uses it for the "Bucket Usage Guide" task so users get correct connection instructions.

The release workflow publishes Docker images for `api`, `web`, `plugin-hello-world`, `plugin-webhook`, and `plugin-garage` to GHCR. It expects the repository variable `NEXT_PUBLIC_API_URL` to be set so the web image is built with the correct backend URL.

All configurable values are documented in [`deploy/helm/justservice/values.yaml`](deploy/helm/justservice/values.yaml).

When an image tag is left empty in the chart values, Helm uses the chart `appVersion`. That keeps released chart packages aligned with the matching API, web, and plugin image tags by default.

---

## Development commands

```bash
# Frontend — from repo root
pnpm dev          # Start the Next.js app with Turbopack
pnpm build        # Build the Next.js app
pnpm lint         # Lint the frontend
pnpm typecheck    # Type-check the frontend
pnpm format       # Format the frontend

# Add a shadcn component to the frontend app
pnpm dlx shadcn@latest add <component> -c apps/web

# Go API — from apps/api/
go run ./cmd/server
go build -o bin/api ./cmd/server
go vet ./...

# Plugins — from plugins/
go build ./...         # Build all plugins
go run ./hello-world   # Run hello-world plugin
go run ./webhook       # Run webhook plugin
```

---

## RBAC

Roles and permissions are managed in the admin panel (`/admin`). The system ships with default roles:

| Role | Description |
|---|---|
| `admin` | Full access including all administration endpoints |
| `operator` | Can execute any task; read-only admin views |
| `viewer` | Browse tasks and view own execution history |

Custom roles can be created and assigned granular permissions per task category or task slug.

