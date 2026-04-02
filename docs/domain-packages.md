# Domain packages

Conventions for `packages/domain/*`: layout, public surface, and how consumers should import domain code.

## Reference implementation

Use **`@domain/annotations`** as the reference for package structure and public exports. Its entrypoint is [`packages/domain/annotations/src/index.ts`](../packages/domain/annotations/src/index.ts).

## Public API: barrel file

- Expose the package’s **stable** surface only through `src/index.ts` (the package `main` / `types` entry).
- **Do not** import deep paths such as `…/src/use-cases/foo` from outside the package unless there is an exceptional, documented reason (prefer extending the barrel).
- Keep the barrel **explicit**: use named `export { … } from "…"` (and `export type { … }` when you want type-only re-exports) so the public API is readable and grep-friendly.

## Organizing exports in `index.ts`

Group re-exports in this order when a package has them:

1. **Constants** — from `constants.ts`
2. **Entities** — schemas, inferred types, and related Zod helpers from `entities/<entity>.ts`
3. **Shared helpers** — from `helpers.ts` (or `helpers/*.ts` if you re-export specific helpers)
4. **Use-cases** — one block per use-case file under `use-cases/`

Within each block, list exports consistently: put `type` exports first where both types and values are exported from the same module.

Use **`.ts` extensions** in relative import specifiers inside domain packages (for example `from "./entities/annotation.ts"`) so resolution matches repository TypeScript settings.

## What belongs in the barrel

- Use-case functions (for example `*UseCase`) and their **public** input/error types and input schemas that boundaries are expected to use.
- Canonical entity schemas and types that other packages may need.
- Package-level constants intended for callers.

## What to keep out of the barrel

- Anything only used inside the package (private helpers, internal wiring).
- Test-only utilities.
- Experimental APIs unless you intentionally want them as part of the stable contract.

If something is only needed by one app for a transitional period, prefer a boundary-local adapter over widening the domain barrel.

## Adding a new use-case

1. Implement the use-case in `src/use-cases/<name>.ts` (inputs/errors colocated per [AGENTS.md](../AGENTS.md) domain conventions).
2. Add a dedicated `export { … } from "./use-cases/<name>.ts"` block to `src/index.ts` with the use-case, public types, and any boundary-relevant schemas.
3. Run the package `check` / `typecheck` scripts so the barrel stays consistent.

## Related packages

`@domain/scores` follows the same barrel style (constants, entities, helpers, use-cases). Prefer aligning new or refactored packages with the annotations reference when in doubt.

## See also

- Product and lifecycle rules for annotations: [annotations.md](./annotations.md)
- Layering and layout (high level): [architecture-boundaries skill](../.agents/skills/architecture-boundaries/SKILL.md)
