---
name: effect-and-errors
description: Composing Effect programs, domain errors, HttpError, repository error types, or error propagation at HTTP boundaries.
---

# Effect TS and HTTP-aware errors

**When to use:** Composing `Effect` programs, domain errors, `HttpError`, repository error types, or error propagation at HTTP boundaries.

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

### Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.

## Effect patterns

- Prefer `Effect.gen` for sequential effect composition
- Wrap promise-based APIs with `Effect.tryPromise` and typed errors
- Use `Data.TaggedError` for domain-specific error types
- Use `Effect.repeat` with `Schedule` for polling/recurring tasks
- Use `Fiber` for lifecycle management of long-running effects

## Never capture scope-bound services at layer build

Inside `Layer.effect(Tag, Effect.gen(...))`, do **not** store a service read via `yield*` in a closure that methods use later. Resolve the service again inside each method.

Services bound to request/job scope (anything provided at a boundary per invocation — `SqlClient`, `ChSqlClient`, `HttpServerRequest`, session-scoped auth context) must be resolved per call. If the layer-build closure captures such a service, concurrent callers with different scopes share the first-built reference and silently operate on the wrong context.

```typescript
// ❌ WRONG — captures the service at layer build; every method uses the stale closure
export const FooRepositoryLive = Layer.effect(
  FooRepository,
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return {
      save: (x) => sqlClient.query(...),
    }
  }),
)

// ✅ RIGHT — layer build does not yield the service at all; each method resolves fresh
export const FooRepositoryLive = Layer.effect(
  FooRepository,
  Effect.gen(function* () {
    return {
      save: (x) =>
        Effect.gen(function* () {
          const sqlClient = yield* SqlClient
          yield* sqlClient.query(...)
        }),
    }
  }),
)
```

Do **not** add a build-time `yield* SqlClient` as a "dependency assertion" — the dependency is already declared via each method's `R` channel, and a build-time yield is both redundant and an invitation to accidentally capture the service. The `R` on port signatures is the single source of truth.

Port method signatures must include scope-bound services in their `R` channel (e.g. `Effect.Effect<A, E, SqlClient>`). Mark the service class with `@effect-leakable-service` to tell the Effect linter this leak is intentional.

Process-singleton services (crypto keys, static config, a queue publisher) can be captured at build. When unsure, resolve per-call.

## Tracing and observability

Effect programs are instrumented with Effect's native OpenTelemetry support via `@effect/opentelemetry`. This bridges Effect spans into the existing OTel pipeline (Datadog, etc.) so business logic is visible alongside HTTP request spans.

### Use case instrumentation (required for all new use cases)

Every use case function that returns an Effect **must** be wrapped with `Effect.withSpan` and annotated with key business IDs:

```typescript
export const writeScoreUseCase = (input: WriteScoreInput) =>
  Effect.gen(function* () {
    const parsedInput = yield* parseOrBadRequest(writeScoreInputSchema, input, "Invalid score write input")
    yield* Effect.annotateCurrentSpan("score.projectId", parsedInput.projectId)
    yield* Effect.annotateCurrentSpan("score.source", parsedInput.source)
    // ... business logic
  }).pipe(Effect.withSpan("scores.writeScore"))
```

**Rules:**

1. **Span naming:** `{domain}.{functionName}` in camelCase — e.g. `scores.writeScore`, `issues.discoverIssue`, `evaluations.runLiveEvaluation`.
2. **Attribute annotation:** Call `yield* Effect.annotateCurrentSpan("key", value)` early in the function (after input parsing, before business logic) for key IDs (`projectId`, `scoreId`, `issueId`, etc.) and discriminating attributes (`source`, `status`). Only annotate when the value is present (guard nullables).
3. **No type signature changes:** `Effect.withSpan` is transparent — it does not alter the Effect's success, error, or requirements channels.
4. **No extra imports:** `Effect` is already imported in every use case file. `withSpan` and `annotateCurrentSpan` are methods on `Effect`.

### Edge call sites (required for all new Effect.runPromise sites)

Every `Effect.runPromise` call site **must** include `withTracing` in the pipe chain to provide the OTel tracer layer:

```typescript
import { withTracing } from "@repo/observability"

const result = await Effect.runPromise(
  myEffect.pipe(
    withPostgres(Layer.mergeAll(RepoLive, ...), client, organizationId),
    withClickHouse(AnalyticsRepoLive, chClient, organizationId),
    withTracing,
  ),
)
```

**Rules:**

1. `withTracing` is a pipe combinator exported from `@repo/observability`. It provides `EffectOtelTracerLive` — the bridge between Effect's Tracer and the global OTel TracerProvider.
2. Place `withTracing` alongside (not inside) infrastructure providers like `withPostgres` / `withClickHouse`. Tracing is decoupled from DB layers.
3. Without `withTracing`, `Effect.withSpan` calls are no-ops (Effect's default tracer discards spans). In tests this is fine — tests don't initialize OTel.
4. Active OTel spans from HTTP middleware (Hono `@hono/otel`) are automatically picked up as parents, so Effect spans nest correctly under request traces.

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
- Durable documentation for this pattern lives in `dev-docs/issues.md` under *Domain errors (`@domain/issues` reference pattern)* and in `AGENTS.md` (domain schema conventions).

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

Repository **method naming** (`findById` vs `listByXxx`, `delete` vs `softDelete`, etc.) is documented in [dev-docs/repositories.md](../../../dev-docs/repositories.md). **`findBy*` must not return `Entity | null` for missing rows** — use `NotFoundError` (or domain-specific not-found) on the error channel; boundaries may catch and map to optional UX when required.
