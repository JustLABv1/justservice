# JustService Helm Chart

Self-service task execution portal with plugin-based execution. Deploys the API (Go), web frontend (Next.js), optional bundled PostgreSQL, and any registered plugins.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+
- (Optional) cert-manager for TLS, an nginx ingress controller, or equivalent

## Install

```bash
helm install justservice oci://ghcr.io/justlabv1/charts/justservice \
  --set config.jwtSecret=$(openssl rand -base64 48) \
  --set config.oidc.publicBaseUrl=https://justservice.example.com \
  --set ingress.hosts[0].host=justservice.example.com
```

Pin to a specific chart version:

```bash
helm install justservice oci://ghcr.io/justlabv1/charts/justservice --version 0.2.0 \
  --set config.jwtSecret=$(openssl rand -base64 48) \
  --set config.oidc.publicBaseUrl=https://justservice.example.com \
  --set ingress.hosts[0].host=justservice.example.com
```

## Production setup (external secrets + external database)

```bash
# 1. Create secrets outside of Helm
kubectl create secret generic justservice-jwt \
  --from-literal=jwt-secret=$(openssl rand -base64 48)

kubectl create secret generic justservice-db \
  --from-literal=database-dsn='postgres://user:pass@host:5432/justservice?sslmode=require'

# 2. Install without any secrets in values
helm install justservice oci://ghcr.io/justlabv1/charts/justservice \
  --set config.existingSecret.name=justservice-jwt \
  --set config.oidc.publicBaseUrl=https://justservice.example.com \
  --set postgresql.enabled=false \
  --set database.existingSecret.name=justservice-db \
  --set ingress.hosts[0].host=justservice.example.com
```

## Values reference

### Global

| Key | Description | Default |
|-----|-------------|---------|
| `nameOverride` | Override the chart name | `""` |
| `fullnameOverride` | Override the full release name | `""` |
| `global.imageRegistry` | Global image registry prefix (overrides per-component registries) | `""` |
| `imagePullSecrets` | List of image pull secret names | `[]` |
| `podSecurityContext` | Pod-level security context applied to API, web, and plugin pods | `runAsNonRoot: true, runAsUser: 65534, fsGroup: 65534` |
| `containerSecurityContext` | Container-level security context applied to API, web, and plugin containers | `allowPrivilegeEscalation: false, capabilities.drop: [ALL]` |

### API

| Key | Description | Default |
|-----|-------------|---------|
| `api.image.registry` | Image registry | `ghcr.io` |
| `api.image.repository` | Image repository | `justlabv1/justservice/api` |
| `api.image.tag` | Image tag (defaults to `Chart.appVersion`) | `""` |
| `api.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `api.replicaCount` | Number of API replicas | `1` |
| `api.service.type` | Service type | `ClusterIP` |
| `api.service.httpPort` | HTTP port | `8080` |
| `api.service.grpcPort` | gRPC port (used by plugins) | `9090` |
| `api.resources` | CPU/memory requests and limits | see `values.yaml` |
| `api.extraEnv` | Additional environment variables | `[]` |

### Web

| Key | Description | Default |
|-----|-------------|---------|
| `web.image.registry` | Image registry | `ghcr.io` |
| `web.image.repository` | Image repository | `justlabv1/justservice/web` |
| `web.image.tag` | Image tag (defaults to `Chart.appVersion`) | `""` |
| `web.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `web.replicaCount` | Number of web replicas | `1` |
| `web.service.type` | Service type | `ClusterIP` |
| `web.service.port` | HTTP port | `3000` |
| `web.resources` | CPU/memory requests and limits | see `values.yaml` |

### Plugins

Each plugin is defined under `plugins.<name>`:

| Key | Description | Default (garage example) |
|-----|-------------|---------|
| `plugins.<name>.enabled` | Enable this plugin | `false` |
| `plugins.<name>.image.*` | Image settings | see `values.yaml` |
| `plugins.<name>.replicaCount` | Replicas | `1` |
| `plugins.<name>.grpcPort` | gRPC port the plugin listens on | `9003` |
| `plugins.<name>.env` | Plain environment variables | `[]` |
| `plugins.<name>.secretEnv` | Secret-backed environment variables (see below) | `[]` |
| `plugins.<name>.resources` | CPU/memory requests and limits | see `values.yaml` |

**Secret env example for plugins:**
```yaml
plugins:
  garage:
    enabled: true
    secretEnv:
      - name: GARAGE_ADMIN_TOKEN
        secretName: garage-plugin-secrets
        secretKey: admin-token
```

### Ingress

| Key | Description | Default |
|-----|-------------|---------|
| `ingress.enabled` | Create an Ingress resource | `true` |
| `ingress.className` | Ingress class name | `nginx` |
| `ingress.annotations` | Annotations to add to the Ingress | `{}` |
| `ingress.hosts` | List of host/path rules (see `values.yaml`) | example host |
| `ingress.tls` | TLS configuration | `[]` |

### Configuration

| Key | Description | Default |
|-----|-------------|---------|
| `config.existingSecret.name` | Name of a pre-existing Secret containing the JWT key. When set, `config.jwtSecret` is ignored. | `""` |
| `config.existingSecret.key` | Key inside `config.existingSecret` | `jwt-secret` |
| `config.jwtSecret` | JWT signing secret. **Required** when `config.existingSecret.name` is empty. Minimum 32 characters. | `""` |
| `config.logLevel` | Log level (`debug`, `info`, `warn`, `error`) | `info` |
| `config.logFormat` | Log format (`json`, `pretty`) | `json` |
| `config.oidc.publicBaseUrl` | Public base URL for OIDC redirect callbacks (e.g. `https://justservice.example.com`) | `""` |
| `config.oidc.existingProvidersSecret.name` | Pre-existing Secret with OIDC provider bootstrap JSON | `""` |
| `config.oidc.existingProvidersSecret.key` | Key inside the OIDC providers Secret | `oidc-bootstrap-providers.json` |
| `config.oidc.providers` | Inline OIDC provider list (dev only — avoid committing client secrets) | `[]` |

**Preferred OIDC setup:**
```bash
kubectl create secret generic justservice-oidc \
  --from-literal=oidc-bootstrap-providers.json='[{
    "name": "Keycloak",
    "issuer_url": "https://sso.example.com/realms/justservice",
    "client_id": "justservice",
    "client_secret": "...",
    "scopes": ["offline_access"],
    "enabled": true
  }]'
```
```yaml
config:
  oidc:
    existingProvidersSecret:
      name: justservice-oidc
```

### Database

| Key | Description | Default |
|-----|-------------|---------|
| `database.dsn` | Full PostgreSQL DSN. Required when `postgresql.enabled=false` and `database.existingSecret.name` is empty. | `""` |
| `database.existingSecret.name` | Pre-existing Secret containing the database DSN. When set, `database.dsn` is ignored. | `""` |
| `database.existingSecret.key` | Key inside the database Secret | `database-dsn` |

### Bundled PostgreSQL

Suitable for development and single-node deployments only. Set `postgresql.enabled=false` and configure `database.existingSecret` for production.

| Key | Description | Default |
|-----|-------------|---------|
| `postgresql.enabled` | Deploy bundled PostgreSQL StatefulSet | `true` |
| `postgresql.username` | Database user | `justservice` |
| `postgresql.password` | Database password (used when `postgresql.existingSecret.name` is empty). Also used to build the DSN stored in the chart Secret — see note below. | `justservice` |
| `postgresql.existingSecret.name` | Pre-existing Secret for `POSTGRES_PASSWORD` in the StatefulSet. | `""` |
| `postgresql.existingSecret.key` | Key inside the postgresql Secret | `postgres-password` |
| `postgresql.database` | Database name | `justservice` |
| `postgresql.storage` | PVC size | `10Gi` |
| `postgresql.resources` | CPU/memory requests and limits | see `values.yaml` |
| `postgresql.podSecurityContext` | Pod security context for the PostgreSQL pod | `runAsNonRoot: true, runAsUser: 999, fsGroup: 999` |
| `postgresql.containerSecurityContext` | Container security context for PostgreSQL | `allowPrivilegeEscalation: false, capabilities.drop: [ALL]` |

> **Note:** When `postgresql.existingSecret.name` is set, `postgresql.password` is still used to construct the database DSN written to the chart-managed Secret (unless `database.existingSecret.name` is also set). For a fully secret-free values file when using bundled postgres, set both `postgresql.existingSecret` **and** `database.existingSecret` with the pre-built DSN.

## Secrets management summary

| Secret | Inline value | External Secret |
|--------|-------------|-----------------|
| JWT signing key | `config.jwtSecret` | `config.existingSecret` |
| Database DSN | `database.dsn` | `database.existingSecret` |
| PostgreSQL password | `postgresql.password` | `postgresql.existingSecret` |
| OIDC providers | `config.oidc.providers` | `config.oidc.existingProvidersSecret` |

All four support the same pattern: set `existingSecret.name` to skip writing that credential into the chart-managed Secret and reference your own K8s Secret instead.
