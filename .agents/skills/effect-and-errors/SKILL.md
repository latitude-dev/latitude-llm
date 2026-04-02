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
- **Domain** errors must implement the `HttpError` interface (`httpStatus` and `httpMessage`), even when the error is not yet surfaced over HTTP—that may change. Use a readonly field for static messages and a getter for messages computed from error fields.
- **Platform** packages (`packages/platform/*`): use the same `Data.TaggedError` discipline. Infrastructure or config errors that are not meant to map 1:1 to an HTTP response may omit `HttpError` until they cross an app boundary; the reference for that style is **`@platform/env`** (see [Reference: TaggedError in `@platform/env`](#reference-taggederror-in-platformenv)). If a platform error can reach a user-facing HTTP response, either add `HttpError` on that class or map it to a domain / HTTP-aware error at the boundary.

## Reference: TaggedError in `@platform/env`

**Canonical reference:** `packages/platform/env/src/index.ts` — `MissingEnvValueError` and `InvalidEnvValueError`.

Use this shape for platform-level failures (config parsing, client setup, I/O wrappers) when you want small, composable error types without baking in HTTP semantics yet.

**Guidelines**

1. **Export** error classes from the package so callers can narrow with `Effect.catchTag` or union them in `Effect.Effect<Success, E1 | E2>`.
2. **Tag** matches intent: `Data.TaggedError("MissingEnvValueError")` — keep the string aligned with the class name.
3. **Payload** is a readonly object of primitive or small structural fields; avoid throwing from getters.
4. **Messages for operators:** override `get message()` (and optionally `get stack()`) so logs and debugging stay readable; default `Error` stacks are often noisy for tagged errors.
5. **APIs** return `Effect` with an explicit error union; use `Effect.fail(new MyError({ ... }))` for failure paths.
6. **Composition:** importing modules may union env errors with their own tags (e.g. `MissingEnvValueError | InvalidEnvValueError | MyClientError`).

**Minimal example (config / validation style)**

```typescript
import { Data, Effect } from "effect"

export class BadConfigError extends Data.TaggedError("BadConfigError")<{
  readonly key: string
  readonly reason: string
}> {
  override get message() {
    return `Invalid config ${this.key}: ${this.reason}`
  }
}

export function readFlag(name: string): Effect.Effect<boolean, BadConfigError> {
  const raw = process.env[name]
  if (raw === undefined) {
    return Effect.fail(new BadConfigError({ key: name, reason: "missing" }))
  }
  if (raw !== "true" && raw !== "false") {
    return Effect.fail(new BadConfigError({ key: name, reason: `expected true|false, got ${raw}` }))
  }
  return Effect.succeed(raw === "true")
}
```

**When to add `HttpError`**

- Omit on low-level platform errors that only propagate inside workers, migrations, or startup wiring.
- Add (or map at the boundary) when the same failure can surface through `apps/*` HTTP handlers so `honoErrorHandler` can respond consistently.

## HTTP error handling pattern

All **domain** errors that participate in HTTP-facing flows implement the `HttpError` interface from `@repo/utils`:

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
