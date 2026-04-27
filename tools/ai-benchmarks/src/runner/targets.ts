import { fileURLToPath } from "node:url"
import { classifyTraceForQueueUseCase, SYSTEM_QUEUE_FLAGGER_MODEL } from "@domain/annotation-queues"
import { mapJailbreakBench } from "../mappers/jailbreakbench.ts"
import type { FixtureRow } from "../types.ts"
import { fixtureRowToTraceDetail } from "./adapter.ts"
import { BENCHMARK_ORG_ID, BENCHMARK_PROJECT_ID } from "./benchmark-identity.ts"

/**
 * Descriptor for one benchmark target. Adding a new target (e.g.
 * `flaggers:refusal`, later `annotator`) is a new entry here plus its mapper.
 */
export interface BenchmarkTarget {
  readonly id: string
  readonly mapper: () => Promise<FixtureRow[]>
  readonly mapperSourcePath: string
  readonly classify: (row: FixtureRow) => ReturnType<typeof classifyTraceForQueueUseCase>
  readonly provider: string
  readonly modelId: string
}

// Every flagger target follows the shape `flaggers:<queueSlug>`. The
// factory wires a `BenchmarkTarget` to the existing classifier by passing
// the slug through — no duplication of the slug string between the target
// id and the `classifyTraceForQueueUseCase` call.
interface FlaggerDef {
  readonly queueSlug: string
  readonly mapper: () => Promise<FixtureRow[]>
  readonly mapperSourcePath: string
}

// Pricing + provenance for flagger benchmarks come from the same constant
// the production flagger uses (`SYSTEM_QUEUE_FLAGGER_MODEL`). If production
// swaps the model, the benchmark reports update automatically — no manual
// sync of provider / model ids.
const flaggerTarget = ({ queueSlug, mapper, mapperSourcePath }: FlaggerDef): BenchmarkTarget => ({
  id: `flaggers:${queueSlug}`,
  mapper,
  mapperSourcePath,
  classify: (row) =>
    classifyTraceForQueueUseCase({
      organizationId: BENCHMARK_ORG_ID,
      projectId: BENCHMARK_PROJECT_ID,
      traceId: row.id,
      queueSlug,
      trace: fixtureRowToTraceDetail(row),
    }),
  provider: SYSTEM_QUEUE_FLAGGER_MODEL.provider,
  modelId: SYSTEM_QUEUE_FLAGGER_MODEL.model,
})

export const TARGETS: readonly BenchmarkTarget[] = [
  flaggerTarget({
    queueSlug: "jailbreaking",
    mapper: mapJailbreakBench,
    mapperSourcePath: fileURLToPath(new URL("../mappers/jailbreakbench.ts", import.meta.url)),
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
