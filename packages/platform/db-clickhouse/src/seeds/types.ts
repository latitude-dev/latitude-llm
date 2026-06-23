import type { ClickHouseClient } from "@clickhouse/client"
import type { SeedScope } from "@domain/shared/seeding"
import type { Effect } from "effect"

export interface SeedContext {
  readonly client: ClickHouseClient
  /**
   * Per-project seeding context — see {@link SeedScope}. Each ClickHouse
   * seeder resolves trace/span hex ids and entity references via
   * `ctx.scope`, so the same seeder body works for both the canonical
   * bootstrap project (`pnpm ch:seed`) and a demo project created at
   * runtime via the backoffice.
   */
  readonly scope: SeedScope
  /** When true, seeders skip progress logs. Tests opt in. */
  readonly quiet?: boolean
  readonly maxTau2Trajectories?: number
}

export interface Seeder {
  readonly name: string
  readonly run: (ctx: SeedContext) => Effect.Effect<void, unknown>
}

/**
 * A deterministic seeded-trace identity. Every fixed/demo trace id is
 * `scope.traceHex(traceKey, index)`, so a `(traceKey, index)` pair regenerates
 * the same id under any project. The demo-project snapshot import enumerates
 * the full slot catalog to remap the source project's trace/session ids onto
 * the freshly seeded project's ids — without it, the imported derived data
 * points at traces that only exist under the source project.
 */
export interface TraceSlot {
  readonly traceKey: string
  readonly index: number
}
