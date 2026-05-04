import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { classifyTraceForFlaggerUseCase, FLAGGER_MODEL, type FlaggerStrategy } from "@domain/flaggers"
import { mapJailbreaking } from "../mappers/jailbreak.ts"
import { mapRefusal } from "../mappers/refusal.ts"
import type { FixtureRow } from "../types.ts"
import { fixtureRowToTraceDetail } from "./adapter.ts"
import { BENCHMARK_ORG_ID, BENCHMARK_PROJECT_ID } from "./benchmark-identity.ts"

// Workspace root, resolved from this file's location. Used to compute paths
// to source files outside the benchmark package (e.g. the strategy `.ts`
// files the optimizer mutates). Four `..` because this file lives at
// `tools/ai-benchmarks/src/runner/targets.ts`.
const WORKSPACE_ROOT = fileURLToPath(new URL("../../../..", import.meta.url))
const FLAGGERS_PKG = join(WORKSPACE_ROOT, "packages/domain/flaggers")
const flaggerStrategyFilePath = (flaggerSlug: string): string =>
  join(FLAGGERS_PKG, "src/flagger-strategies", `${flaggerSlug}.ts`)
const FLAGGERS_PACKAGE_JSON = join(FLAGGERS_PKG, "package.json")

/**
 * Optimization config for a `ts-module` candidate (e.g. flagger strategies).
 * The optimizer compiles the file at `strategyFilePath`, dynamic-imports it,
 * and reads `exportName` to obtain a `FlaggerStrategy` shape.
 */
export interface TsModuleOptimizationConfig {
  readonly candidateKind: "ts-module"
  readonly strategyFilePath: string
  readonly packageJsonPath: string
  readonly flaggerSlug: string
  readonly exportName: string
}

/**
 * Descriptor for one benchmark target. Adding a new target (e.g.
 * `flaggers:refusal`, later `annotator`) is a new entry here plus its mapper.
 *
 * `optimization` is the optimizer registry hook: targets that opt in declare
 * what kind of candidate they expose (`ts-module` for flagger strategies,
 * `text-template` planned for future annotators) plus the per-kind metadata
 * the optimizer needs. `benchmark:run` ignores this field; only
 * `benchmark:optimize` reads it.
 */
export interface BenchmarkTarget {
  readonly id: string
  readonly mapper: () => Promise<FixtureRow[]>
  readonly mapperSourcePaths: readonly string[]
  readonly classify: (
    row: FixtureRow,
    strategyOverride?: FlaggerStrategy,
  ) => ReturnType<typeof classifyTraceForFlaggerUseCase>
  readonly provider: string
  readonly modelId: string
  readonly optimization?: TsModuleOptimizationConfig
}

// Every flagger target follows the shape `flaggers:<flaggerSlug>`. The
// factory wires a `BenchmarkTarget` to the existing classifier by passing
// the slug through — no duplication of the slug string between the target
// id and the `classifyTraceForFlaggerUseCase` call.
interface FlaggerDef {
  readonly flaggerSlug: string
  readonly mapper: () => Promise<FixtureRow[]>
  readonly mapperSourcePaths: readonly string[]
}

// Flagger files export `<camelCaseSlug>Strategy`. e.g. `jailbreaking` →
// `jailbreakingStrategy`, `tool-call-errors` → `toolCallErrorsStrategy`.
const camelCaseSlug = (slug: string): string => slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

// Pricing + provenance for flagger benchmarks come from the same constant
// the production flagger uses (`FLAGGER_MODEL`). If production
// swaps the model, the benchmark reports update automatically — no manual
// sync of provider / model ids.
const flaggerTarget = ({ flaggerSlug, mapper, mapperSourcePaths }: FlaggerDef): BenchmarkTarget => ({
  id: `flaggers:${flaggerSlug}`,
  mapper,
  mapperSourcePaths,
  classify: (row, strategyOverride) =>
    classifyTraceForFlaggerUseCase({
      organizationId: BENCHMARK_ORG_ID,
      projectId: BENCHMARK_PROJECT_ID,
      traceId: row.id,
      flaggerSlug,
      trace: fixtureRowToTraceDetail(row),
      ...(strategyOverride ? { strategyOverride } : {}),
    }),
  provider: FLAGGER_MODEL.provider,
  modelId: FLAGGER_MODEL.model,
  optimization: {
    candidateKind: "ts-module",
    strategyFilePath: flaggerStrategyFilePath(flaggerSlug),
    packageJsonPath: FLAGGERS_PACKAGE_JSON,
    flaggerSlug,
    exportName: `${camelCaseSlug(flaggerSlug)}Strategy`,
  },
})

export const TARGETS: readonly BenchmarkTarget[] = [
  flaggerTarget({
    flaggerSlug: "jailbreaking",
    mapper: mapJailbreaking,
    mapperSourcePaths: [
      fileURLToPath(new URL("../mappers/jailbreak.ts", import.meta.url)),
      fileURLToPath(new URL("../mappers/jailbreak/jailbreakbench.ts", import.meta.url)),
    ],
  }),
  flaggerTarget({
    flaggerSlug: "refusal",
    mapper: mapRefusal,
    mapperSourcePaths: [
      fileURLToPath(new URL("../mappers/refusal.ts", import.meta.url)),
      fileURLToPath(new URL("../mappers/refusal/xstest.ts", import.meta.url)),
    ],
  }),
]

export const TARGETS_BY_ID: ReadonlyMap<string, BenchmarkTarget> = new Map(TARGETS.map((t) => [t.id, t]))

/** Convert an ID like `flaggers:jailbreaking` to a disk-friendly path fragment. */
export function targetPath(id: string): string {
  return id.replaceAll(":", "/")
}

/**
 * Resolve `--only` / `--except` selectors against the registered targets.
 * Each selector is either a literal ID or a glob (`flaggers:*`). Throws on
 * any selector that matches nothing — typos fail loudly.
 */
export function resolveTargets(only?: readonly string[], except?: readonly string[]): BenchmarkTarget[] {
  const matchesSelector = (id: string, selector: string): boolean => {
    if (!selector.includes("*")) return id === selector
    const pattern = new RegExp(`^${selector.replaceAll(".", "\\.").replaceAll("*", ".*")}$`)
    return pattern.test(id)
  }
  const matchAny = (id: string, selectors: readonly string[]): boolean => selectors.some((s) => matchesSelector(id, s))

  if (only !== undefined) {
    for (const sel of only) {
      if (!TARGETS.some((t) => matchesSelector(t.id, sel))) {
        throw new Error(`--only '${sel}' matches no targets. known: ${TARGETS.map((t) => t.id).join(", ")}`)
      }
    }
  }
  if (except !== undefined) {
    for (const sel of except) {
      if (!TARGETS.some((t) => matchesSelector(t.id, sel))) {
        throw new Error(`--except '${sel}' matches no targets. known: ${TARGETS.map((t) => t.id).join(", ")}`)
      }
    }
  }

  return TARGETS.filter((t) => {
    if (only !== undefined && !matchAny(t.id, only)) return false
    if (except !== undefined && matchAny(t.id, except)) return false
    return true
  })
}
