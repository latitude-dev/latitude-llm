import { z } from "@hono/zod-openapi"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { OperationContext } from "../core/context.ts"
import { OperationInputError } from "../core/invoke.ts"
import { toolsAnalyticsToolset } from "./tools-analytics.ts"

describe("toolsAnalyticsToolset", () => {
  it("derives a stable tool manifest from the operation registry", async () => {
    // Same serialization as `emit-mcp.ts`, so the snapshot reads like mcp.json
    // and a review of its diff answers "what did the agent's tool surface gain".
    const manifest = toolsAnalyticsToolset.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: z.toJSONSchema(tool.inputSchema, { target: "draft-2020-12" }),
    }))
    await expect(JSON.stringify(manifest, null, 2)).toMatchFileSnapshot("./__snapshots__/tools-analytics.manifest.json")
  })

  it("invokes tools in-process, validating flat input before execute runs", async () => {
    const getToolErrors = toolsAnalyticsToolset.tools.find((tool) => tool.name === "getToolErrors")
    expect(getToolErrors).toBeDefined()

    // Missing required `projectSlug`/`toolName` fails validation before any
    // repository work — no HTTP and no database involved.
    const error = await Effect.runPromise(
      Effect.flip(getToolErrors?.invoke({ limit: "5" }, {} as OperationContext) ?? Effect.void),
    )
    expect(error).toBeInstanceOf(OperationInputError)
  })
})
