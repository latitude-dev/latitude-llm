# Latitude Helm chart

Deploys a scalable, self-hosted [Latitude](https://latitude.so) on any conformant Kubernetes cluster, using the published [Docker Hub images](https://hub.docker.com/u/latitudedata) (`latitudedata/<service>`). The chart version tracks the Latitude release, and images default to that same version (`image.tag` overrides). Full guide: [docs.latitude.so/deployment/cluster](https://docs.latitude.so/deployment/cluster).

## Quick start

```bash
helm install latitude ./charts/latitude \
  --namespace latitude --create-namespace \
  --set config.webUrl=https://latitude.example.com \
  --set config.apiUrl=https://api.latitude.example.com \
  --set config.ingestUrl=https://ingest.latitude.example.com \
  --set secrets.masterEncryptionKey=$(openssl rand -hex 32) \
  --set secrets.betterAuthSecret=$(openssl rand -hex 32) \
  --set postgres.auth.password=$(openssl rand -hex 16) \
  --set postgres.auth.runtimePassword=$(openssl rand -hex 16) \
  --set clickhouse.auth.password=$(openssl rand -hex 16) \
  --timeout 15m
```

This brings up the five application services (`web`, `api`, `ingest`, `workers`, `workflows`), runs database migrations as a one-shot job, and bundles all infrastructure: Postgres (pgvector), ClickHouse, Redis (cache + BullMQ), a Postgres-backed Temporal, and a SeaweedFS object store.

> Generated secrets are permanent for the installation — store the values you passed (or use `--values` with a file you keep). `helm upgrade` must receive the same secrets.

## Bring your own infrastructure

Every bundled dependency is an independent toggle. Set `<dep>.enabled=false` and fill `<dep>.external` to point Latitude at an existing or managed instance:

| Dependency | Toggle | External block |
| --- | --- | --- |
| Postgres (needs `vector` extension) | `postgres.enabled` | `postgres.external.databaseUrl` + `.adminDatabaseUrl` |
| ClickHouse | `clickhouse.enabled` | `clickhouse.external.{url,username,password,database,migrationUrl}` |
| Redis cache | `redis.enabled` | `redis.external.{host,port,tls,cluster}` |
| Redis BullMQ | `redisBullmq.enabled` | `redisBullmq.external.{host,port,password,cluster}` |
| Temporal / Temporal Cloud | `temporal.enabled` | `temporal.external.{address,namespace,apiKey}` |
| Object store (any S3-compatible) | `seaweedfs.enabled` | `seaweedfs.external.{bucket,region,accessKeyId,secretAccessKey,endpoint,forcePathStyle}` |

## Secrets

By default the chart renders a Secret from values. Optional secret env vars — AI provider keys (`LAT_VOYAGE_API_KEY`, `LAT_OPENAI_API_KEY`, ...), email transport passwords, OAuth client secrets — go in `secrets.extra` and are merged into that same Secret:

```yaml
secrets:
  extra:
    LAT_VOYAGE_API_KEY: pa-...
    LAT_SMTP_PASS: "..."
```

To manage secrets yourself, create a Secret and set `secrets.existingSecret` (add any optional keys to it directly). It must define:

- `LAT_MASTER_ENCRYPTION_KEY`, `LAT_BETTER_AUTH_SECRET`
- `LAT_DATABASE_URL`, `LAT_ADMIN_DATABASE_URL` — plus, when `postgres.enabled`: `POSTGRES_PASSWORD`, `POSTGRES_RUNTIME_PASSWORD`
- `LAT_CLICKHOUSE_PASSWORD` — plus, when `clickhouse.enabled`: `CLICKHOUSE_PASSWORD`
- `LAT_STORAGE_S3_ACCESS_KEY_ID`, `LAT_STORAGE_S3_SECRET_ACCESS_KEY`
- When `temporal.enabled`: `TEMPORAL_POSTGRES_PASSWORD`; when using Temporal Cloud: `LAT_TEMPORAL_API_KEY`
- When the external BullMQ Redis has auth: `LAT_BULLMQ_PASSWORD`

## Optional features

The rest of the optional `LAT_*` env contract — email transport settings (required for magic-link sign-in), `LAT_AI_*` model selection, integrations — goes in `config.extraEnv` (standard `EnvVar` entries, `valueFrom` supported). Keep secret values out of `extraEnv` literals: use `secrets.extra` (or `valueFrom.secretKeyRef`) so they live in a Kubernetes Secret instead of the pod spec. See the [configuration reference](https://docs.latitude.so/deployment/configuration).
