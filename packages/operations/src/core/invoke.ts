import type { z } from "@hono/zod-openapi"
import { Data, Effect } from "effect"
import type { OperationContext } from "./context.ts"
import type { AnyOperation } from "./define-operation.ts"
import { flattenRouteInputSchema, splitFlatInput } from "./flatten-input.ts"

/** Raw tool input rejected by the operation's flattened input schema. */
export class OperationInputError extends Data.TaggedError("OperationInputError")<{
  readonly operation: string
  readonly error: z.ZodError
}> {}

/**
 * Runs an execute-form operation in-process from the flat MCP-style input
 * shape: validate against the flattened route schema (applying the same
 * coercions and defaults the HTTP validators apply), split fields back into
 * `{ params, query, body }`, and call `execute` with the given context. No
 * HTTP, no auth middleware — the caller owns tenancy via `ctx`, which is why
 * consumers must build `ctx` from an already-resolved organization.
 *
 * Dies (defect, not typed failure) on handler-form operations: toolset
 * selection asserts `execute` presence at definition time, so reaching that
 * path is a programming error.
 */
export const invokeOperation = (
  operation: AnyOperation,
  rawInput: Record<string, unknown>,
  ctx: OperationContext,
): Effect.Effect<unknown, unknown> => {
  const execute = operation.execute
  if (execute === undefined) {
    return Effect.die(new Error(`Operation "${operation.route.name}" is handler-form; convert to execute-form first`))
  }
  const flat = flattenRouteInputSchema(operation.route)
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
