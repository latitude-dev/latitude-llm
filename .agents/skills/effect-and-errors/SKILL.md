---
name: effect-and-errors
description: Composing Effect programs, domain errors, HttpError, repository error types, or error propagation at HTTP boundaries.
---

# Effect TS and HTTP-aware errors

**When to use:** Composing `Effect` programs, domain errors, `HttpError`, repository error types, or error propagation at HTTP boundaries.

## Effect patterns

- Prefer `Effect.gen` for sequential effect composition
- Wrap promise-based APIs with `Effect.tryPromise` and typed errors
- Use `Data.TaggedError` for domain-specific error types
- Use `Effect.repeat` with `Schedule` for polling/recurring tasks
- Use `Fiber` for lifecycle management of long-running effects

## Error handling

- Always use typed errors (`Data.TaggedError`) instead of raw `Error` at domain/platform boundaries
- Use `Effect.either` for operations that may fail but shouldn't stop execution
- Handle errors at boundaries; propagate through Effect error channel internally
- Every domain error must implement the `HttpError` interface (`httpStatus` and `httpMessage`), even when the error is not yet surfaced over HTTP—that may change. Use a readonly field for static messages and a getter for messages computed from error fields.

## Domain package layout (reference: `@domain/issues`)

Use `packages/domain/issues/src/errors.ts` as the **gold standard** for organizing domain-specific errors:

- Colocate package-wide tagged error classes in `src/errors.ts`; use-cases import from `../errors.ts`.
- Prefer **specific** error class names for domain rules; reserve `@domain/shared` errors for generic infrastructure shapes (`RepositoryError`, generic `NotFoundError`, etc.).
- Export **union types** per flow or use-case group (for example `CheckEligibilityError`) so `Effect` error channels stay explicit.
- Durable documentation for this pattern lives in `docs/issues.md` under *Domain errors (`@domain/issues` reference pattern)* and in `AGENTS.md` (domain schema conventions).

## HTTP error handling pattern

All domain errors implement the `HttpError` interface from `@repo/utils`:

```typescript
interface HttpError {
  readonly _tag: string
  readonly httpStatus: number
  readonly httpMessage: string
}
```

**Implementation rules:**

1. Domain errors carry their own HTTP metadata (`httpStatus`, `httpMessage`)
2. Repositories return typed errors (e.g., `NotFoundError`) instead of null
3. Routes fail loudly — no try/catch, let errors propagate
4. Centralized error handling via `app.onError(honoErrorHandler)` in server.ts
5. Error middleware converts HttpError instances to appropriate HTTP responses

**Example domain errors:**

```typescript
// Static message
export class QueuePublishError extends Data.TaggedError("QueuePublishError")<{
  readonly cause: unknown
  readonly queue: QueueName
}> {
  readonly httpStatus = 502
  readonly httpMessage = "Queue publish failed"
}

// Dynamic message computed from fields
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string
  readonly id: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `${this.entity} not found`
  }
}
```

**Example repository method:**

```typescript
findById(id: OrganizationId): Effect.Effect<Organization, NotFoundError | RepositoryError>
```

Repository **method naming** (`findById` vs `listByXxx`, `delete` vs `softDelete`, etc.) is documented in [docs/repositories.md](../../../docs/repositories.md). **`findBy*` must not return `Entity | null` for missing rows** — use `NotFoundError` (or domain-specific not-found) on the error channel; boundaries may catch and map to optional UX when required.
