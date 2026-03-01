# Rewrite Plan

## PR1 - Reset repository for rewrite

1. Remove legacy v1 runtime code from this branch.
2. Keep root clean with only rewrite-oriented scripts and CI.
3. Persist rewrite scope and sequencing in this plan document.

## PR2 - Scaffold new architecture

1. Scaffold apps: `web`, `api`, `ingest`, `workers`, `workflows`.
2. Scaffold packages for domain contracts and platform adapters:
   - `domain/shared-kernel`
   - `domain/workspaces`
   - `domain/identity`
   - `domain/projects`
   - `domain/subscriptions`
   - `domain/events`
   - `platform/db-postgres`
   - `platform/db-clickhouse`
   - `platform/cache-redis`
   - `platform/queue-bullmq`
   - `platform/storage-object`
   - `platform/events-outbox`
   - `observability`
   - `testkit`
   - `tsconfig`
   - `vitest-config`
3. Add tooling baseline:
   - Biome for lint/format
   - Vitest test baseline
   - Effect as standard library
4. Add local development boundaries with docker for:
   - Postgres
   - ClickHouse
   - Redis
   - Mailpit

## Next phases

1. Implement baseline domains and contracts:
   - workspaces, users, api keys, events, magic links, oauth, projects, memberships, subscriptions
2. Implement public API for baseline domains.
3. Implement UI for baseline domains.
4. Implement tracing vertical slice:
   - ingestion
   - public API
   - web UI
5. Introduce Temporal Cloud workflows behind API adapters:
   - direct workflow reads for MVP
   - projection-ready API design
