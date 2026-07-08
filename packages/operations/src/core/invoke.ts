import type { z } from "@hono/zod-openapi"
import { Data, Effect } from "effect"
import type { OperationContext } from "./context.ts"
import type { AnyOperation } from "./define-operation.ts"
import { type FlatInput, flattenRouteInputSchema, splitFlatInput } from "./flatten-input.ts"

/** Raw tool input rejected by the operation's flattened input schema. */
export class OperationInputError extends Data.TaggedError("OperationInputError")<{
  readonly operation: string
  readonly error: z.ZodError
}> {}

/**
 * Runs an execute-form operation in-process against an already-flattened input
 * schema: validate `rawInput` (applying the same coercions and defaults the
 * HTTP validators apply), split fields back into `{ params, query, body }`, and
 * call `execute` with the given context. No HTTP, no auth middleware — the
 * caller owns tenancy via `ctx`, which is why consumers must build `ctx` from
 * an already-resolved organization.
 *
 * Takes `flat` as a parameter so hot callers (a toolset's `invoke`, called once
 * per agent tool call) can flatten the static route schema once at build time
 * instead of on every call. Dies (defect, not typed failure) on handler-form
 * operations: toolset selection asserts `execute` presence at definition time.
 */
export const invokeOperationWithFlat = (
  operation: AnyOperation,
  rawInput: Record<string, unknown>,
  ctx: OperationContext,
  flat: FlatInput,
): Effect.Effect<unknown, unknown> => {
  const execute = operation.execute
  if (execute === undefined) {
    return Effect.die(new Error(`Operation "${operation.route.name}" is handler-form; convert to execute-form first`))
  }
  const parsed = flat.schema.safeParse(rawInput)
  if (!parsed.success) {
    return Effect.fail(new OperationInputError({ operation: operation.route.name, error: parsed.error }))
  }
  const { params, query, body } = splitFlatInput(parsed.data, flat.sources)
  const input = {
    ...(operation.route.request?.params !== undefined ? { params } : {}),
    ...(operation.route.request?.query !== undefined ? { query } : {}),
    ...(body !== undefined ? { body } : {}),
  }
  return execute(input, ctx)
}

/**
 * Convenience wrapper around {@link invokeOperationWithFlat} that flattens the
 * route schema per call. Use it for one-off invocations; for repeated calls,
 * flatten once and call {@link invokeOperationWithFlat} directly.
 */
export const invokeOperation = (
  operation: AnyOperation,
  rawInput: Record<string, unknown>,
  ctx: OperationContext,
): Effect.Effect<unknown, unknown> =>
  invokeOperationWithFlat(operation, rawInput, ctx, flattenRouteInputSchema(operation.route))
