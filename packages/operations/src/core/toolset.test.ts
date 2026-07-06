import { createRoute, z } from "@hono/zod-openapi"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { defineOperation } from "./define-operation.ts"
import type { OperationModule } from "./mount.ts"
import { resetOperationRegistry } from "./registry.ts"
import { defineToolset } from "./toolset.ts"

type TestEnv = { Variables: Record<string, never> }

beforeEach(() => {
  resetOperationRegistry()
})

const operation = defineOperation<TestEnv>("/widgets")

const makeOperation = ({
  name,
  group = "widgets",
  readOnly = true,
  executeForm = true,
}: {
  name: string
  group?: string
  readOnly?: boolean
  executeForm?: boolean
}) => {
  const route = createRoute({
    method: "get" as const,
    path: "/",
    name,
    group,
    sdkMethod: name,
    summary: `Summary of ${name}`,
    description: `Description of ${name}`,
    annotations: { readOnlyHint: readOnly, destructiveHint: false },
    request: { query: z.object({ limit: z.coerce.number().optional() }) },
    responses: {
      200: { content: { "application/json": { schema: z.object({ ok: z.boolean() }) } }, description: "OK" },
    },
  })
  return executeForm
    ? operation({ route, execute: () => Effect.succeed({ status: 200, body: { ok: true } } as const) })
    : operation({ route, handler: async (c) => c.json({ ok: true }, 200) })
}

const moduleOf = (...ops: ReturnType<typeof makeOperation>[]): OperationModule => ({
  path: "/widgets",
  operations: ops,
})

describe("defineToolset", () => {
  it("selects operations by group in manifest order and shapes them as tools", () => {
    const a = makeOperation({ name: "aWidget" })
    const b = makeOperation({ name: "bWidget" })
    const other = makeOperation({ name: "otherThing", group: "other" })

    const toolset = defineToolset({ name: "t", groups: ["widgets"] }, [moduleOf(a, b, other)])
    expect(toolset.tools.map((t) => t.name)).toEqual(["aWidget", "bWidget"])
    const tool = toolset.tools[0]
    expect(tool?.title).toBe("Summary of aWidget")
    expect(tool?.description).toBe("Description of aWidget")
    expect(tool?.annotations.readOnlyHint).toBe(true)
    expect(Object.keys(tool?.inputSchema.shape ?? {})).toEqual(["limit"])
    expect(tool?.outputSchema).toBeDefined()
  })

  it("supports excluding selected operations by name", () => {
    const a = makeOperation({ name: "aWidget" })
    const b = makeOperation({ name: "bWidget" })
    const toolset = defineToolset({ name: "t", groups: ["widgets"], exclude: ["bWidget"] }, [moduleOf(a, b)])
    expect(toolset.tools.map((t) => t.name)).toEqual(["aWidget"])
  })

  it("throws when a group matches no operations", () => {
    const a = makeOperation({ name: "aWidget" })
    expect(() => defineToolset({ name: "t", groups: ["widgets", "nope"] }, [moduleOf(a)])).toThrowError(
      /group "nope" matched no operations/,
    )
  })

  it("throws on a stale exclude", () => {
    const a = makeOperation({ name: "aWidget" })
    expect(() => defineToolset({ name: "t", groups: ["widgets"], exclude: ["gone"] }, [moduleOf(a)])).toThrowError(
      /exclude "gone" matched no selected operation/,
    )
  })

  it("throws when a selected operation is not read-only", () => {
    const mutating = makeOperation({ name: "createWidget", readOnly: false })
    expect(() => defineToolset({ name: "t", groups: ["widgets"] }, [moduleOf(mutating)])).toThrowError(
      /"createWidget" is not read-only/,
    )
  })

  it("throws when a selected operation is handler-form", () => {
    const legacy = makeOperation({ name: "legacyWidget", executeForm: false })
    expect(() => defineToolset({ name: "t", groups: ["widgets"] }, [moduleOf(legacy)])).toThrowError(
      /"legacyWidget" is handler-form/,
    )
  })
})
