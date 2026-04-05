# ADR 0001: Domain entity schema style (Zod standard)

- **Status:** Accepted (amended)
- **Date:** 2026-04-02
- **Context:** Linear AGE-49 / GitHub discussion on mixed entity patterns across `packages/domain/*`.

## Context

Domain packages expose entity shapes from `src/entities/<entity>.ts`. Historically some used **Zod** and others used **plain TypeScript** `interface` / `type`, which made new work inconsistent.

## Decision

1. **Standardize on Zod** for all `packages/domain/*` **entity** modules: export `*Schema` and derive `export type * = z.infer<typeof *Schema>`.
2. **Factories and mutators** should validate with `schema.parse` / `safeParse` where appropriate so schemas stay authoritative as rules evolve.
3. **Shared ID and settings parsing** live in `@domain/shared` (`*IdSchema`, `organizationSettingsSchema`, `projectSettingsSchema`, `simulationIdOrEmptySchema`, etc.) so entity files do not duplicate CUID or settings rules.

Authoring details and checklist: [`docs/domain-entities.md`](../domain-entities.md).

## Consequences

- One **golden path** for agents and humans; reference [`docs/domain-entities.md`](../domain-entities.md).
- Boundaries and tests can import the same schemas as domain code.
- Complex or foreign types may use `z.custom` or readonly wrappers; that is still Zod-first.
