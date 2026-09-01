# Self-hosting

Latitude is MIT-licensed and self-hostable at any scale on fully open infrastructure. This document is the durable engineering reference for *how self-hosting is built* — the tiers, the artifacts, the image flow, the storage abstraction, and the bring-your-own-infrastructure model. Operator-facing setup lives in the public docs under [`docs/deployment/`](../docs/deployment/) (rendered at https://docs.latitude.so/deployment); the license rationale lives in [`./licensing.md`](./licensing.md); this is the architecture behind both.

This is distinct from [`./deployment.md`](./deployment.md), which covers *Latitude's own* release/deploy process (single-branch trunk + release tags). Self-hosting is about third parties running the product.

## One product, one image set, multiple tiers

Latitude is five application services — `web`, `api`, `ingest`, `workers`, `workflows` — plus a one-shot `migrations` job, backed by Postgres (with pgvector), ClickHouse, two Redis roles (cache + BullMQ queue), Temporal, and an object store. **Every tier deploys the same published images with the same `LAT_*` configuration contract; only the orchestration differs.**

| Tier | Audience | Orchestration | Source-of-truth artifact |
| --- | --- | --- | --- |
| **1 — Local (development)** | Contributors | Docker Compose for infra + local dev servers | `.env.example` / `.env.development` + `docker-compose.yml` |
| **2 — Single-host (production simple)** | One machine / small prod | Docker Compose (or Swarm) | [`docker-stack.yml`](../docker-stack.yml) + `.env.example` (prod guidance) |
| **3 — Cluster (production advanced)** | Kubernetes / HA | Helm chart | [`charts/latitude/`](../charts/latitude/) |
| **One-click (convenience)** | Fastest managed start | Railway template (dashboard-authored) | Published Railway template + the README/overview deploy button |

The tiers are a progression, not forks: the env contract is identical, so moving from single-host to cluster is a re-orchestration, not a reconfiguration. The Railway one-click is a convenience layer over the same images and contract (it has no in-repo artifact because Railway templates are authored on its dashboard and read no repo file).

## Images: build → publish → tag

There are **two registries with different jobs**:

- **Docker Hub `latitudedata/<service>` — the public self-host registry.** Env-neutral, multi-arch (amd64 + arm64) images for the six build targets (`api`, `ingest`, `workers`, `workflows`, `web`, `migrations`), built once and run everywhere. Tagging is tied to the release flow: `:X.Y.Z` and `:latest` on a release (the git tag `vX.Y.Z` with the `v` stripped) are the stable tags self-hosters pin; `:development` is the edge tag on trunk pushes. Published by `publish-docker-images.yml`. This is the **only** registry self-hosters should pull from.
- **GHCR `latitude-<env>-<service>` — Latitude's private own-deploy registry.** Per-environment, sha-tagged, consumed only by Latitude's own ECS deploy (`deploy.yml` / `build-images.yml`). Never a self-host source.

The `web` image is env-neutral: frontend URLs are relative and the single SSR-absolute case (`og:image`) reads runtime `LAT_WEB_URL`, so no deployment URL is baked at build time.

## Storage abstraction

Object storage is a port, not a hardcoded backend. The domain exposes `StorageDiskPort` (`@domain/shared`); `@platform/storage-object` adapts a [flydrive](https://flydrive.dev) `Disk` to it. `LAT_STORAGE_DRIVER` selects the driver:

- **`fs`** (flydrive FS driver) — a local/volume path (`LAT_STORAGE_FS_ROOT`). Fine for Tier 1 and a single-node Tier 2 with a durable volume; **not** usable when services don't share a filesystem (multi-node, or platforms like Railway where each service has its own disk).
- **`s3`** (flydrive S3 driver, `@aws-sdk/client-s3`) — any S3-compatible endpoint. The self-host default object store is **bundled SeaweedFS** (Apache-2.0, single container in Tier 2 / Tier 3), reached via `LAT_STORAGE_S3_ENDPOINT` + `LAT_STORAGE_S3_FORCE_PATH_STYLE=true`; or **bring your own** managed S3 (drop the endpoint/path-style for AWS S3).

Because it's a port, no new abstraction is needed to add a backend — only configuration.

## Shared-infra coexistence and bring-your-own

Every infra dependency is designed to be **isolatable** (safe to run on an instance shared with other workloads) and **replaceable** (swap the bundle for a managed equivalent):

- **Redis keys are namespaced.** `REDIS_KEY_PREFIX = "latitude:"` (`@platform/cache-redis`) is applied as the ioredis `keyPrefix` for cache/locks/rate-limiters; BullMQ derives its own `latitude:{bull}` prefix from it. A shared Redis is therefore safe.
- **Dedicated keyspaces.** Postgres uses a dedicated `latitude` schema (plus the `vector` extension and a schema-create admin role); ClickHouse a dedicated database; Temporal a dedicated namespace + task queue; object storage a dedicated bucket/prefix.
- **Toggle per dependency.** Tier 2 marks each infra block in `docker-stack.yml` independently removable; Tier 3 exposes a `<dep>.enabled` flag with an `external:` block per dependency (Postgres / ClickHouse / Redis / BullMQ Redis / Temporal / object store). Disable the bundle and point the matching `LAT_*` at your managed instance — the contract is identical.

## Canonical self-host profile

The blessed default configuration, verified per tier. Defaults match Latitude Cloud so an untouched deploy behaves identically.

**Adapters (OSS-default ports):**

- **Postgres + pgvector** (`pgvector/pgvector:pg16`) — dedicated `latitude` schema; `vector` extension; schema-create admin role. The app connects as a restricted RLS runtime role (`latitude_app`); migrations/seeds use the admin role.
- **ClickHouse** (`clickhouse/clickhouse-server`) — dedicated database; span/telemetry OLAP store.
- **Redis ×2** — cache + durable BullMQ queue (appendonly, `noeviction`); namespaced, shareable.
- **Temporal** (Postgres-backed default + visibility store, no Elasticsearch/Cassandra) — dedicated namespace + task queue; Temporal Cloud is an optional external.
- **Object storage** — `fs` (Tier 1) / bundled SeaweedFS behind `s3` (Tier 2/3) / BYO managed S3.
- **Email** — Mailpit (dev) or any SMTP / Mailgun / SendGrid (prod). With no transport reachable, magic-link/invite email won't send, so one is effectively required to sign in.

**Billing and retention:** the plan catalog ships in the OSS build but enforces nothing unless `LAT_BILLING_ENABLED=true` (Latitude Cloud sets it on every service). Without it every organization with no manual billing override resolves to the `self-hosted` plan: no credit cap, no ingest `402`, and telemetry retention taken from `LAT_TELEMETRY_RETENTION_DAYS` (default and maximum `3650`). An override still wins, so an operator can pin one organization to a capped plan on an otherwise unenforced deployment. See [`./billing.md`](./billing.md) for the resolution order and why a bad value dies rather than falling back.

**AI providers (pluggable, env-configurable; defaults = Latitude Cloud):**

AI is never constructed at boot — each provider reads its key lazily and fails per-call with a tagged error, so **every service boots and core observability (trace ingest + viewing) works with zero AI keys.** Providers and models are selected with `LAT_AI_*` (per-feature generation overrides → global `LAT_AI_GENERATION_*` → built-in default; embeddings/reranking are global-only):

- **Generation** → Amazon Bedrock by default; selectable across `amazon-bedrock` / `anthropic` / `openai` / `google` / `custom` (any OpenAI-compatible endpoint — the fully-OSS path via Ollama/vLLM/LM Studio).
- **Embeddings** → Voyage AI by default; `voyage` / `openai` / `google` / `custom`. The model must emit the fixed **2048-dim** vectors (baked into the pgvector/ClickHouse schema). **The embedding model is a one-time, install-time choice** — Latitude never re-embeds existing data, so switching it on a live deployment breaks semantic search/clustering and is unsupported.
- **Reranking** → Voyage AI by default; `voyage` / `amazon-bedrock`. Optional; unavailable reranking degrades to hybrid-search order.

See [`./ai-generation-features.md`](./ai-generation-features.md) for the per-feature resolver and the configuration reference at `docs/deployment/configuration.mdx` for the full `LAT_*` matrix.
</content>
