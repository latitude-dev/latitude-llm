import { createRoute, z } from "@hono/zod-openapi"
import { Cause, Effect, Exit } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import type { OperationContext } from "./context.ts"
import { defineOperation } from "./define-operation.ts"
import { invokeOperation, OperationInputError } from "./invoke.ts"
import { resetOperationRegistry } from "./registry.ts"

type TestEnv = { Variables: Record<string, never> }

const stubCtx = { organization: { id: "org-1" } } as unknown as OperationContext

beforeEach(() => {
  resetOperationRegistry()
})

const operation = defineOperation<TestEnv>("/projects/:projectSlug/widgets")

const getWidget = operation({
  route: createRoute({
    method: "get",
    path: "/{id}",
    name: "getWidget",
    group: "widgets",
    sdkMethod: "get",
    description: "Get a widget",
    annotations: { readOnlyHint: true, destructiveHint: false },
    request: {
      params: z.object({ projectSlug: z.string(), id: z.string() }),
      query: z.object({ limit: z.coerce.number().int().default(10) }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ id: z.string(), limit: z.number(), org: z.string() }) } },
        description: "OK",
      },
    },
  }),
  execute: (input, ctx) =>
    Effect.succeed({
      status: 200,
      body: { id: input.params.id, limit: input.query.limit, org: ctx.organization.id as string },
    } as const),
})

describe("invokeOperation", () => {
  it("parses flat input (coercions + defaults) and runs execute with the given context", async () => {
    const result = await Effect.runPromise(
      invokeOperation(getWidget, { projectSlug: "proj", id: "w1", limit: "5" }, stubCtx),
    )
    expect(result).toEqual({ status: 200, body: { id: "w1", limit: 5, org: "org-1" } })

    const defaulted = await Effect.runPromise(invokeOperation(getWidget, { projectSlug: "proj", id: "w1" }, stubCtx))
    expect(defaulted).toEqual({ status: 200, body: { id: "w1", limit: 10, org: "org-1" } })
  })

  it("fails with OperationInputError on invalid flat input", async () => {
    const error = await Effect.runPromise(Effect.flip(invokeOperation(getWidget, { id: "w1" }, stubCtx)))
    expect(error).toBeInstanceOf(OperationInputError)
    expect((error as OperationInputError).operation).toBe("getWidget")
  })

  it("dies on handler-form operations", async () => {
    const handlerForm = operation({
      route: createRoute({
        method: "get",
        path: "/",
        name: "listWidgets",
        group: "widgets",
        sdkMethod: "list",
        description: "List widgets",
        annotations: { readOnlyHint: true, destructiveHint: false },
        responses: { 200: { description: "OK" } },
      }),
      handler: async (c) => c.body(null, 200),
    })
    const exit = await Effect.runPromiseExit(invokeOperation(handlerForm, {}, stubCtx))
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
  })
})
