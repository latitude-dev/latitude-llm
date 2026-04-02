# Domain entities: Zod schemas vs TypeScript types

This document explains how `@domain/*` packages model **entities** in `src/entities/<entity>.ts`, why both **Zod schemas** and **plain TypeScript interfaces / types** appear today, and how to choose for **new** code.

Canonical layout for any domain package is still: entities in `src/entities/`, constants in `src/constants.ts`, errors in `src/errors.ts` (see `AGENTS.md`).

## Decision criteria

Use the table below when adding or reshaping an entity.

| Concern | Prefer **Zod** (`*Schema` + `z.infer<typeof *Schema>`) | Prefer **TypeScript only** (`interface` / `type`) |
| --- | --- | --- |
| **Validation** | You need **runtime** checks: string lengths, numeric ranges, unions with sentinels, refinements across fields (`superRefine`), or parsing **untrusted** input (HTTP body, queue payload, external tool output). | Shape is **only** produced by trusted code (e.g. repository mapper from DB row you control) and invalid states are treated as bugs, not user-facing validation errors. |
| **Serialization / parsing** | You parse or coerce **wire or storage** shapes (JSON, string dates, optional fields) and want one definition for both parse and type. | Serialization is handled entirely at the boundary with separate Zod (or other) schemas, and the domain entity is purely the in-memory shape after mapping. |
| **Runtime type checking** | You want `safeParse` / `parse` in tests, workers, or use-cases to assert invariants on composed objects (metadata blobs, discriminated variants). | Compile-time typing is enough; no need to re-validate full entities at runtime in domain code. |
| **Shared contracts** | Other packages or apps should **import the same schema** to avoid duplicating field rules (lengths, literals, branded ids). | The shape is internal to one package and duplicated field rules are not a maintenance risk. |

**Practical default for new entities:** define a **Zod schema** as the source of truth and export `export type Entity = z.infer<typeof entitySchema>` unless you have a clear reason from the table to stay TypeScript-only (for example, a large telemetry DTO that is only ever built inside a typed adapter).

**Not mutually exclusive:** a package may use Zod for some entities and TypeScript types for others. Prefer consistency **within** a bounded context when touch points (validation, tests, cross-package reuse) are similar.

## Package inventory (current state)

The following lists **`packages/domain/*`** packages that define `src/entities/*` today. Rationale summarizes why the current style is reasonable; it is not a requirement to migrate immediately.

### Zod-first canonical entities

| Package | Notes |
| --- | --- |
| `@domain/scores` | Rich metadata variants, anchors, cross-field rules; heavy reuse by annotations and reliability flows. |
| `@domain/evaluations` | Structured evaluation model, matrices, alignment; benefits from shared parseable contracts. |
| `@domain/issues` | Lifecycle and centroid shapes; validation aligned with discovery and API surfaces. |
| `@domain/simulations` | Sentinels, thresholds, and cross-field invariants (`passed` / `errored` / `error`, timestamps). |
| `@domain/annotation-queues` | Queue settings embed filter sets; entity and item shapes parsed at boundaries. |

### Zod via re-export

| Package | Notes |
| --- | --- |
| `@domain/annotations` | Annotation entity **is** the annotation score shape; re-exports `@domain/scores` schemas and types to keep a single canonical definition. |

### TypeScript interfaces / types only

| Package | Notes |
| --- | --- |
| `@domain/spans` | Large telemetry-oriented shapes (`Span`, `Trace`); typically constructed in platform mappers from trusted pipelines rather than validated as a whole with Zod in domain. |
| `@domain/models` | Pricing and cost helpers; mostly typed data structures without a single persisted “entity” document boundary in domain. |
| `@domain/projects` | Small CRUD-style row projection; validation often lives at HTTP/repository boundary. |
| `@domain/organizations` | Membership and org rows; same pattern as projects. |
| `@domain/users` | User projection; boundary validation elsewhere. |
| `@domain/email` | Template/content types for mail; not persisted domain aggregates in the same sense as reliability entities. |
| `@domain/datasets` | Dataset and row shapes; flexible row payloads (`Record<string, unknown>`) skew toward mapper-level handling. |
| `@domain/api-keys` | Credential metadata; often mapped from DB with boundary validation for creation only. |

Packages under `packages/domain` **without** an `entities/` tree (e.g. shared kernel, queue, events) are out of scope for this split.

## Guidelines for new entity files

1. **Name exports consistently:** `entitySchema` and `Entity = z.infer<typeof entitySchema>` when using Zod; `Entity` as `interface` or `type` when not.
2. **Reuse, do not duplicate:** import field schemas, branded id schemas, and constants from `@domain/shared` or sibling domains instead of re-stating lengths and literals.
3. **Keep use-case-only inputs in use-case files** until a second consumer needs them (`AGENTS.md`).
4. **Tests:** for Zod entities, add `safeParse` tests for invalid cases that encode business rules (see `@domain/scores` / `@domain/issues` entity tests).
5. **Migrating** an existing TypeScript-only entity to Zod is optional; do it when you need runtime validation or shared schemas and the churn is justified.

## Related documentation

- [ADR 0001: Domain entity schema style](./adr/0001-domain-entity-schema-style.md) — records the default for new entities and why both styles coexist.
- [Domain errors reference pattern](./issues.md#domain-errors-domainissues-reference-pattern) — orthogonal concern; entities vs errors.
- `AGENTS.md` — module layout and “canonical entity schema” convention.
