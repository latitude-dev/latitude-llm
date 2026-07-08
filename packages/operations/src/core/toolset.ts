import type { z } from "@hono/zod-openapi"
import type { Effect } from "effect"
import type { OperationContext } from "./context.ts"
import {
  type AnyOperation,
  accessToAnnotations,
  type McpToolAnnotations,
  type OperationAccess,
} from "./define-operation.ts"
import { extractOutputSchema } from "./extract-output.ts"
import { flattenRouteInputSchema } from "./flatten-input.ts"
import { invokeOperationWithFlat } from "./invoke.ts"
import type { OperationModule } from "./mount.ts"

export interface ToolsetSpec {
  readonly name: string
  /**
   * Operation `group`s to include (the field that also names the SDK group).
   * Omit to consider every group — e.g. a whole-registry read-only toolset.
   */
  readonly groups?: ReadonlyArray<string>
  /** Operation `name`s to leave out of the selected set. */
  readonly exclude?: ReadonlyArray<string>
  /**
   * Highest {@link OperationAccess} the toolset admits. Cumulative: `"write"`
   * admits read-only and write operations; `"destructive"` admits everything.
   * Defaults to `"read-only"` — an agent gets no mutations unless the toolset
   * explicitly raises the ceiling.
   */
  readonly access?: OperationAccess
}

const ACCESS_RANK = { "read-only": 0, write: 1, destructive: 2 } as const

/** One selected operation, shaped for an LLM tool loop. */
export interface ToolsetTool {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly annotations: McpToolAnnotations
  readonly inputSchema: z.ZodObject<z.ZodRawShape>
  readonly outputSchema?: z.ZodObject<z.ZodRawShape>
  readonly invoke: (rawInput: Record<string, unknown>, ctx: OperationContext) => Effect.Effect<unknown, unknown>
}

export interface Toolset {
  readonly name: string
  readonly tools: ReadonlyArray<ToolsetTool>
}

/**
 * Selects operations from `modules` and shapes them as in-process agent tools.
 *
 * Selection is a **filter**: an operation is included when it is tool-eligible,
 * execute-form (so it can run in-process), within the access ceiling
 * (`spec.access`, default `"read-only"` — cumulative), and in `spec.groups` if
 * given. Everything else is silently dropped, not errored — so a whole-registry
 * read-only toolset just yields the read-only, execute-form operations, and an
 * operation joins automatically once it's converted to execute-form. Writes
 * never reach a read-only toolset by construction (they're filtered out).
 *
 * Only genuine misconfiguration throws: a `groups` entry that matches no
 * operation at all (typo), or an `exclude` name that matches nothing in scope
 * (stale). Tool order follows the module manifest.
 */
export const defineToolset = (spec: ToolsetSpec, modules: ReadonlyArray<OperationModule>): Toolset => {
  const operations = modules.flatMap((mod) => mod.operations)
  const ceiling = spec.access ?? "read-only"

  if (spec.groups) {
    for (const group of spec.groups) {
      if (!operations.some((op) => op.route.group === group)) {
        throw new Error(`Toolset "${spec.name}": group "${group}" matched no operations`)
      }
    }
  }
  const groups = spec.groups
  const scoped = groups ? operations.filter((op) => groups.includes(op.route.group)) : operations

  for (const name of spec.exclude ?? []) {
    if (!scoped.some((op) => op.route.name === name)) {
      throw new Error(`Toolset "${spec.name}": exclude "${name}" matched no operation in scope`)
    }
  }
  const excluded = new Set(spec.exclude ?? [])

  const selected = scoped.filter(
    (op) =>
      op.tool &&
      op.execute !== undefined &&
      ACCESS_RANK[op.access] <= ACCESS_RANK[ceiling] &&
      !excluded.has(op.route.name),
  )

  return {
    name: spec.name,
    tools: selected.map((op) => toToolsetTool(op)),
  }
}

const toToolsetTool = (operation: AnyOperation): ToolsetTool => {
  // Flatten the static route schema once per tool, not per invocation — a tight
  // agent loop calls `invoke` repeatedly and the flattened schema never changes.
  const flat = flattenRouteInputSchema(operation.route)
  const output = extractOutputSchema(operation.route)
  return {
    name: operation.route.name,
    title: operation.route.summary ?? operation.route.name,
    description: operation.route.description ?? "",
    annotations: accessToAnnotations(operation.access),
    inputSchema: flat.schema,
    ...(output ? { outputSchema: output.schema } : {}),
    invoke: (rawInput, ctx) => invokeOperationWithFlat(operation, rawInput, ctx, flat),
  }
}
