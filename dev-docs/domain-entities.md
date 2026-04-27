# Domain entities: Zod golden path

Every **`packages/domain/*`** package that defines persisted or shared **entities** uses **Zod** as the single source of truth in `src/entities/<entity>.ts`:

1. Export `entitySchema` (and nested `*Schema` values as needed).
2. Export `export type Entity = z.infer<typeof entitySchema>` (or `z.output` if you use transforms everywhere and need output types explicitly).
3. **Factories and mutators** that build entities should end with `entitySchema.parse(...)` (or `safeParse` at boundaries) so invariants stay enforced when you add refinements later.

Canonical layout for any domain package is still: entities in `src/entities/`, constants in `src/constants.ts`, errors in `src/errors.ts` (see `AGENTS.md`).

## Shared building blocks (`@domain/shared`)

- **`cuidSchema`** and **`*IdSchema`** helpers (e.g. `projectIdSchema`, `organizationIdSchema`) — parse strings into branded IDs. Prefer these in entity schemas instead of raw `z.string()`.
- **`organizationSettingsSchema`** / **`projectSettingsSchema`** — settings blobs embedded on org/project entities.

Import from `@domain/shared` in entity files; do not duplicate CUID length or settings field rules.

## When Zod adds the most value

Use schemas for:

- **Runtime validation** — lengths, ranges, unions, `superRefine` across fields.
- **Parsing** — wire JSON, queue payloads, or external data coerced into domain types.
- **Shared contracts** — the same `entitySchema` imported at HTTP boundaries and in tests (`safeParse`).

Even when a row is built in a trusted repository mapper, keeping a schema documents allowed shapes and gives a single place to tighten rules.

## Readonly and complex fields

- For **telemetry list DTOs** (`Span`, `Trace`, `Session`), use **`.readonly()`** on `z.array` and `z.record` so inferred types stay compatible with `readonly` arrays/objects from OTLP mappers.
- For **third-party types** (e.g. `GenAIMessage` from `rosetta-ai`), use **`z.custom<GenAIMessage>(...)`** with a minimal structural guard when you cannot describe the shape in Zod.

## Package reference

All domain packages under `packages/domain/*` that define `src/entities/*` use Zod for those entities, including:

`api-keys`, `annotation-queues`, `annotations` (re-exports scores), `datasets`, `email`, `evaluations`, `issues`, `models`, `organizations`, `projects`, `scores`, `simulations`, `spans`, `users`.

Packages without an `entities/` tree (e.g. `shared`, `queue`, `events`) are not entity packages.

## New entity checklist

1. Add **`entitySchema`** in `src/entities/<entity>.ts` and **`export type Entity = z.infer<typeof entitySchema>`**.
2. Reuse **`@domain/shared`** id and settings schemas; reuse **constants** from `src/constants.ts` for max lengths and sentinels.
3. Export the schema from the package **`index.ts`** when other packages or apps need the same parse rules.
4. Add **`safeParse` tests** when the schema encodes non-obvious business rules (see `@domain/scores`, `@domain/issues`).
5. Keep **use-case-only inputs** in the use-case file until a second consumer needs them (`AGENTS.md`).

## Related documentation

- [ADR 0001: Domain entity schema style](./adr/0001-domain-entity-schema-style.md) — decision to standardize on Zod for domain entities.
- [Domain errors reference pattern](./issues.md#domain-errors-domainissues-reference-pattern) — orthogonal; entities vs errors.
- `AGENTS.md` — module layout and canonical entity location.
