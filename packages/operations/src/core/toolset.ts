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
  /** Operation `group`s to include — the same field that names the SDK group. */
  readonly groups: ReadonlyArray<string>
  /** Operation `name`s to leave out of the matched groups. */
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
 * Selects operations from `modules` by `group` and shapes them as in-process
 * agent tools. Selection is asserted mechanically at definition time — a
 * toolset that would silently select nothing, carry a stale exclude, or hand
 * an agent a mutating or handler-form operation throws instead, so tests and
 * consumer boot fail loudly:
 *
 * 1. every entry in `groups` matches at least one operation (typo guard),
 * 2. every `exclude` name exists among the matched operations (stale guard),
 * 3. every selected operation is tool-eligible, execute-form, and within the
 *    toolset's access ceiling (`spec.access`, default `"read-only"`) — so an
 *    agent only gets the mutation level the toolset explicitly opts into.
 *
 * Tool order follows the module manifest, so derived manifests are stable and
 * snapshot-testable.
 */
export const defineToolset = (spec: ToolsetSpec, modules: ReadonlyArray<OperationModule>): Toolset => {
  const operations = modules.flatMap((mod) => mod.operations)
  const candidates = operations.filter((op) => spec.groups.includes(op.route.group))
  const ceiling = spec.access ?? "read-only"

  for (const group of spec.groups) {
    if (!candidates.some((op) => op.route.group === group)) {
      throw new Error(`Toolset "${spec.name}": group "${group}" matched no operations`)
    }
  }
  for (const name of spec.exclude ?? []) {
    if (!candidates.some((op) => op.route.name === name)) {
      throw new Error(`Toolset "${spec.name}": exclude "${name}" matched no selected operation`)
    }
  }

  const selected = candidates.filter((op) => !spec.exclude?.includes(op.route.name))
  for (const op of selected) {
    if (!op.tool) {
      throw new Error(`Toolset "${spec.name}": "${op.route.name}" is not tool-eligible; exclude it`)
    }
    if (ACCESS_RANK[op.access] > ACCESS_RANK[ceiling]) {
      throw new Error(
        `Toolset "${spec.name}": "${op.route.name}" needs access "${op.access}", above toolset ceiling "${ceiling}" — exclude it or raise the toolset's access`,
      )
    }
    if (op.execute === undefined) {
      throw new Error(`Toolset "${spec.name}": "${op.route.name}" is handler-form; convert to execute-form first`)
    }
  }

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
