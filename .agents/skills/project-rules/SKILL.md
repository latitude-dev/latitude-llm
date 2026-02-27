# Skill: project-rules

Use this skill to keep implementation aligned with this repository's architecture and engineering standards.

## Purpose

Apply the platform's baseline rules when designing features, writing code, reviewing changes, and planning new integrations.

Primary reference: `./project-rules-and-patterns.md`.

## Use this skill when

- Scaffolding new apps, packages, or domain modules.
- Implementing ingest, query, or worker functionality.
- Adding DB/cache/queue/object storage/external providers.
- Reviewing architecture decisions and PRs for boundary violations.
- Creating implementation plans that should follow project conventions.

## Required architecture checks

1. **Boundary check**
   - `apps/*` only validates/authenticates/authorizes/routes.
   - No business rules in endpoint or job handlers.

2. **DDD check**
   - Business logic stays in `packages/domain/*`.
   - Domain exposes use-cases, domain types, and dependency ports.

3. **Ports/adapters check**
   - Domain depends on interfaces/tags only.
   - Platform packages implement adapters.
   - Composition roots provide live layers.

4. **Data placement check**
   - Postgres for control-plane.
   - ClickHouse for telemetry.
   - Redis for queue/cache.

## Stack conventions

- Effect TS primitives for core code.
- Drizzle ORM for Postgres adapters.
- Hono for API and ingest boundaries.
- TanStack Start + Solid for web.
- Biome for lint/format.

## Output style for this skill

- Keep guidance concrete and repo-specific.
- Call out any deviation from `docs/project-rules-and-patterns.md`.
- Prefer minimal, explicit abstractions and YAGNI.

## Anti-patterns to reject

- Business logic inside handlers/controllers/jobs.
- Domain importing DB clients, Redis, BullMQ, or object storage SDKs.
- Cross-domain logic without clear ownership.
- New provider integrations without a core capability contract.
