import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { beforeEach, describe, expect, it } from "vitest"
import type { ProtectedEnv } from "../types.ts"
import { defineOperation, type RateLimitTier } from "./define-operation.ts"
import { mountOperationModules } from "./mount.ts"
import { resetOperationRegistry } from "./registry.ts"

type TestEnv = { Variables: Record<string, never> }

beforeEach(() => {
  resetOperationRegistry()
})

const route = (name: string) =>
  createRoute({
    method: "get" as const,
    path: "/",
    name,
    group: "test",
    sdkMethod: name,
    description: name,
    annotations: { readOnlyHint: true, destructiveHint: false },
    responses: {
      200: { content: { "application/json": { schema: z.object({ name: z.string() }) } }, description: "OK" },
    },
  })

describe("mountOperationModules", () => {
  it("mounts each module at its path and applies the tier middleware per operation", async () => {
    const applied: Array<{ tier: RateLimitTier; path: string }> = []
    const widgets = defineOperation<TestEnv>("/widgets")({
      route: route("listWidgets"),
      rateLimitTier: "low",
      handler: async (c) => c.json({ name: "widgets" }, 200),
    })
    const gadgets = defineOperation<TestEnv>("/gadgets")({
      route: route("listGadgets"),
      rateLimitTier: "high",
      handler: async (c) => c.json({ name: "gadgets" }, 200),
    })

    const routes = new OpenAPIHono<ProtectedEnv>()
    mountOperationModules(
      routes,
      [
        { path: "/widgets", operations: [widgets] },
        { path: "/gadgets", operations: [gadgets] },
      ],
      {
        middlewareForTier: (tier) => async (c, next) => {
          applied.push({ tier, path: c.req.path })
          await next()
        },
      },
    )

    const widgetsRes = await routes.fetch(new Request("http://localhost/widgets"))
    expect(widgetsRes.status).toBe(200)
    expect(await widgetsRes.json()).toEqual({ name: "widgets" })

    const gadgetsRes = await routes.fetch(new Request("http://localhost/gadgets"))
    expect(await gadgetsRes.json()).toEqual({ name: "gadgets" })

    expect(applied).toEqual([
      { tier: "low", path: "/widgets" },
      { tier: "high", path: "/gadgets" },
    ])
  })

  it("throws at mount time when an operation declares no rateLimitTier", () => {
    const untiered = defineOperation<TestEnv>("/widgets")({
      route: route("listWidgets"),
      handler: async (c) => c.json({ name: "widgets" }, 200),
    })
    const routes = new OpenAPIHono<ProtectedEnv>()
    expect(() =>
      mountOperationModules(routes, [{ path: "/widgets", operations: [untiered] }], {
        middlewareForTier: () => async (_c, next) => next(),
      }),
    ).toThrowError(/declares no rateLimitTier/)
  })
})
