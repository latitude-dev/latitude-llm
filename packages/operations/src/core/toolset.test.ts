import { createRoute, z } from "@hono/zod-openapi"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { defineOperation, type OperationAccess } from "./define-operation.ts"
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
  access = "read-only",
  executeForm = true,
}: {
  name: string
  group?: string
  access?: OperationAccess
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
    request: { query: z.object({ limit: z.coerce.number().optional() }) },
    responses: {
      200: { content: { "application/json": { schema: z.object({ ok: z.boolean() }) } }, description: "OK" },
    },
  })
  return executeForm
    ? operation({ route, access, execute: () => Effect.succeed({ status: 200, body: { ok: true } } as const) })
    : operation({ route, access, handler: async (c) => c.json({ ok: true }, 200) })
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
      /exclude "gone" matched no operation in scope/,
    )
  })

  it("selects across all groups when `groups` is omitted", () => {
    const a = makeOperation({ name: "aWidget", group: "widgets" })
    const b = makeOperation({ name: "bGadget", group: "gadgets" })
    const toolset = defineToolset({ name: "t" }, [moduleOf(a, b)])
    expect(toolset.tools.map((t) => t.name)).toEqual(["aWidget", "bGadget"])
  })

  it("defaults to a read-only ceiling and admits read-only operations", () => {
    const a = makeOperation({ name: "aWidget", access: "read-only" })
    const toolset = defineToolset({ name: "t", groups: ["widgets"] }, [moduleOf(a)])
    expect(toolset.tools.map((t) => t.name)).toEqual(["aWidget"])
  })

  it("admits everything at or below the ceiling (cumulative)", () => {
    const read = makeOperation({ name: "readWidget", access: "read-only" })
    const write = makeOperation({ name: "writeWidget", access: "write" })
    const destructive = makeOperation({ name: "deleteWidget", access: "destructive" })

    const writeToolset = defineToolset({ name: "w", groups: ["widgets"], access: "write" }, [moduleOf(read, write)])
    // A "write" ceiling still includes the read-only op — cumulative, not exact-match.
    expect(writeToolset.tools.map((t) => t.name)).toEqual(["readWidget", "writeWidget"])

    const destructiveToolset = defineToolset({ name: "d", groups: ["widgets"], access: "destructive" }, [
      moduleOf(read, write, destructive),
    ])
    expect(destructiveToolset.tools.map((t) => t.name)).toEqual(["readWidget", "writeWidget", "deleteWidget"])
  })

  it("excludes operations above the access ceiling", () => {
    const read = makeOperation({ name: "readWidget", access: "read-only" })
    const write = makeOperation({ name: "writeWidget", access: "write" })
    const destructive = makeOperation({ name: "deleteWidget", access: "destructive" })
    // Default ceiling is read-only → only the read-only op survives; writes are dropped, not errored.
    const toolset = defineToolset({ name: "t", groups: ["widgets"] }, [moduleOf(read, write, destructive)])
    expect(toolset.tools.map((t) => t.name)).toEqual(["readWidget"])
  })

  it("excludes handler-form operations (they can't be invoked in-process)", () => {
    const exec = makeOperation({ name: "execWidget" })
    const legacy = makeOperation({ name: "legacyWidget", executeForm: false })
    const toolset = defineToolset({ name: "t", groups: ["widgets"] }, [moduleOf(exec, legacy)])
    expect(toolset.tools.map((t) => t.name)).toEqual(["execWidget"])
  })
})
