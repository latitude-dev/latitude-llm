import type { SqlClient } from "@domain/shared"
import { withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, type Layer } from "effect"
import type { z } from "zod"
import { type AdminSession, requireAdminSession } from "./admin-auth.ts"
import { getAdminPostgresClient } from "./clients.ts"

/**
 * Build a TanStack Start server function that is **structurally** guaranteed to:
 *
 * 1. Reject non-admins with a `NotFoundError` BEFORE any IO — via
 *    {@link requireAdminSession}. The error shape is identical to hitting a
 *    non-existent server function, so RPC probes cannot fingerprint the
 *    admin surface.
 * 2. Run the domain `Effect` against the admin-scoped Postgres client
 *    (`LAT_ADMIN_DATABASE_URL`). `withPostgres` defaults to the `"system"`
 *    organisation scope, which is the only sanctioned RLS-bypass path in
 *    the codebase (see `AdminSearchRepositoryLive` header for rationale).
 * 3. Emit an OTel span via `withTracing`.
 *
 * **Every backoffice server function MUST go through this factory.** The
 * guard is not a line you add to a handler — it is baked into the handler
 * shape, so a missing guard is not a reviewable omission, it is a type
 * error.
 */
interface AdminServerFnConfig<TSchema extends z.ZodTypeAny, TOut, TRepo, TErr, TDto = TOut> {
  readonly method: "GET" | "POST"
  readonly input: TSchema
  /**
   * Repository layer(s) the effect depends on. Use `Layer.mergeAll(...)` when
   * a handler needs multiple repositories — they all share a single
   * `SqlClient`, so multi-repo transactions work as expected.
   */
  readonly layer: Layer.Layer<TRepo, never, SqlClient>
  /**
   * Build the domain effect from validated input and the admin session
   * context (admin user id + the Better Auth user). The handler is free to
   * close over `ctx.userId` for audit-event payloads in future features.
   */
  readonly run: (input: z.infer<TSchema>, ctx: AdminSession) => Effect.Effect<TOut, TErr, TRepo>
  /**
   * Serialise the domain result into the DTO sent over the wire. Defaults
   * to identity when omitted (i.e. `TDto = TOut`). Use this to stringify
   * `Date`s, drop entity wrappers, etc.
   */
  readonly toDto?: (result: TOut) => TDto
}

export function createAdminServerFn<TSchema extends z.ZodTypeAny, TOut, TRepo, TErr, TDto = TOut>(
  config: AdminServerFnConfig<TSchema, TOut, TRepo, TErr, TDto>,
) {
  // TanStack Start's `inputValidator` / `handler` type inference is built
  // around concrete, fully-resolved schema instances — flowing our generic
  // `TSchema` through loses the specificity it needs. We cast at these
  // internal boundaries only, and re-assert the callable's signature at the
  // factory's return. Runtime validation is unaffected (the framework still
  // applies the schema).
  const handler = async ({ data }: { data: z.infer<TSchema> }): Promise<TDto> => {
    const session = await requireAdminSession()
    const client = getAdminPostgresClient()
    const result = await Effect.runPromise(
      config.run(data, session).pipe(withPostgres(config.layer, client), withTracing),
    )
    return config.toDto ? config.toDto(result) : (result as unknown as TDto)
  }
  const fn = createServerFn({ method: config.method })
    // biome-ignore lint/suspicious/noExplicitAny: see comment above
    .inputValidator(config.input as any)
    // biome-ignore lint/suspicious/noExplicitAny: see comment above
    .handler(handler as any)
  return fn as unknown as (args: { data: z.input<TSchema> }) => Promise<TDto>
}
