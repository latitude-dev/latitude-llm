# ADR 0001: Domain entity schema style (Zod vs TypeScript types)

- **Status:** Accepted
- **Date:** 2026-04-02
- **Context:** Linear AGE-49 / GitHub discussion on mixed entity patterns across `packages/domain/*`.

## Context

Domain packages expose entity shapes from `src/entities/<entity>.ts`. Some packages define **Zod** schemas and derive types with `z.infer`; others use **plain TypeScript** `interface` / `type` only. Both patterns are in production without a single documented rule, which led to inconsistent choices for new work.

## Decision

1. **Both styles remain valid** for existing code. No mass migration is required.
2. **Default for new entities:** define a **Zod schema** as the canonical shape and export `type Entity = z.infer<typeof entitySchema>` when any of the following matter: runtime validation, parsing untrusted input, cross-field refinements, or sharing field rules across apps and packages.
3. **TypeScript-only entities** remain appropriate when the shape is built only inside trusted mappers, full-entity runtime validation is unnecessary, and duplication of constraints is low risk.

Detailed criteria, package inventory, and authoring guidelines live in [`docs/domain-entities.md`](../domain-entities.md).

## Consequences

- New PRs can cite `docs/domain-entities.md` instead of guessing from a neighboring package.
- Older packages may still use interfaces; refactors to Zod are opportunistic.
- Documentation and `AGENTS.md` point agents and humans to the same default.
