# Project Rules and Patterns

This document defines the baseline engineering rules for this monorepo.

## Product and architecture scope

- Product: multi-tenant LLM observability platform.
- Monorepo: `pnpm` workspaces + `turbo`.
- Frontend: TanStack Start + Solid (`apps/web`).
- API and ingest boundaries: Hono (`apps/api`, `apps/ingest`).
- Core code primitives: Effect TS (`Effect`, `Layer`, `Context`, typed errors).

## Non-negotiable architecture rules

- App boundaries only in `apps/*`:
  - validate input
  - authenticate and authorize
  - enforce workspace access
  - route to domain use-cases
- Business logic only in `packages/domain/*`.
- Infrastructure details only in `packages/platform/*`.
- Domain code must never import concrete DB/cache/queue/object storage clients.

## Multi-tenancy rules

- Every request is workspace-scoped.
- A user may belong to many workspaces.
- Workspace membership checks happen at boundaries before domain execution.
- All telemetry persistence and query paths include `workspaceId`.

## Data and infra model

- Postgres: control-plane and relational data (users, workspaces, memberships, config).
- ClickHouse: high-volume telemetry storage and analytical reads.
- Redis: cache and BullMQ backend.
- Object storage: durable raw ingest payload buffering.

## Domain design (DDD)

- Organize by bounded context (e.g. telemetry, workspaces, identity, alerts).
- Domains expose:
  - use-cases
  - domain types/errors
  - ports (interfaces/tags for required dependencies)
- Domains should be single-responsibility and focused on policy/rules.

## Ports and adapters pattern

- Domain ports define required capabilities (`Repository`, `CacheStore`, `Publisher`, etc.).
- Platform adapters implement these ports.
- Composition roots in apps provide live layers.
- Use in-memory adapters for fast tests where possible.

## Side effects and eventing

- Domain logic emits domain events through domain-level publisher abstractions.
- Side effects (notifications, integrations, projections) are handled asynchronously by workers.
- Do not put side-effect orchestration inside HTTP handlers.

## Database patterns

- Postgres adapter stack uses Drizzle ORM in `packages/platform/db-postgres`.
- ClickHouse adapter stack remains SQL-oriented in `packages/platform/db-clickhouse`.
- Domain models are independent from table/row shapes.
- Mapping from DB rows to domain objects belongs in platform adapters.

## Testing strategy

- Unit tests: domain entities/use-cases/policies with fakes.
- Contract tests: adapter compliance against domain ports.
- Integration tests: infra-backed tests for Postgres/ClickHouse/Redis/BullMQ/object storage.
- End-to-end tests: ingest boundary to query boundary across workspace scoping.

## Adding new infrastructure dependencies

- Add a capability interface in `packages/platform/*-core`.
- Add concrete provider package in `packages/platform/*-<provider>`.
- Wire via app composition root and environment-driven config.
- Keep domain unchanged unless business behavior changes.

## Style and tooling

- Lint and format: Biome.
- Keep abstractions explicit and minimal.
- Prefer typed errors over untyped exceptions in core logic.
- Avoid comments except for genuinely non-obvious reasoning.
