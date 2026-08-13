import { Effect } from "effect"
import { agentDispatches } from "../../schema/agent-dispatches.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

interface DispatchFixture {
  readonly key: string
  readonly kind: "cursor" | "claude_code" | "linear" | "webhook"
  readonly signalKey: string
  readonly trigger: "signal.discovered" | "signal.regressed" | "incident.opened" | "manual"
  readonly idSuffix: string
  readonly status: "claimed" | "dispatched" | "failed"
  readonly claimedDaysAgo: number
  readonly claimedHour: number
  readonly dispatchedDaysAgo?: number
  readonly externalAgentId?: string
  readonly externalUrl?: string
  readonly errorCategory?: string
  readonly errorDetail?: string
}

// Attaches dispatch-ledger rows to a handful of seeded signals so the signal
// detail page can be reviewed in each "Send to agent" state: no dispatch
// (every other signal), a single dispatch (logistics, combination), and
// multiple dispatches (billing → history popover). Kind is parsed from the
// idempotency key's first segment, so no integration/config row is required.
const DISPATCH_FIXTURES: readonly DispatchFixture[] = [
  {
    key: "billing-cursor-auto",
    kind: "cursor",
    signalKey: "billing",
    trigger: "signal.discovered",
    idSuffix: "window-6d",
    status: "dispatched",
    claimedDaysAgo: 6,
    claimedHour: 9,
    dispatchedDaysAgo: 6,
    externalAgentId: "bc_9f2c1a",
    externalUrl: "https://cursor.com/agents?id=bc_9f2c1a",
  },
  {
    key: "billing-cursor-manual",
    kind: "cursor",
    signalKey: "billing",
    trigger: "manual",
    idSuffix: "send-8ab21",
    status: "dispatched",
    claimedDaysAgo: 2,
    claimedHour: 14,
    dispatchedDaysAgo: 2,
    externalAgentId: "bc_44de77",
    externalUrl: "https://cursor.com/agents?id=bc_44de77",
  },
  {
    key: "billing-linear-failed",
    kind: "linear",
    signalKey: "billing",
    trigger: "manual",
    idSuffix: "send-1c93f",
    status: "failed",
    claimedDaysAgo: 0,
    claimedHour: 6,
    errorCategory: "auth",
    errorDetail: "Linear rejected this API key.",
  },
  {
    key: "logistics-claude",
    kind: "claude_code",
    signalKey: "logistics",
    trigger: "signal.regressed",
    idSuffix: "window-4h",
    status: "dispatched",
    claimedDaysAgo: 0,
    claimedHour: 8,
    dispatchedDaysAgo: 0,
  },
  {
    key: "combination-webhook",
    kind: "webhook",
    signalKey: "combination",
    trigger: "manual",
    idSuffix: "send-77c02",
    status: "claimed",
    claimedDaysAgo: 0,
    claimedHour: 11,
  },
]

const buildAgentDispatchRows = (ctx: SeedContext): (typeof agentDispatches.$inferInsert)[] => {
  const { scope } = ctx
  const signalId = (signalKey: string) => scope.cuid(`issue:${signalKey}`)
  const configId = (kind: string) => scope.cuid(`agent-dispatch-config:${kind}`)

  return DISPATCH_FIXTURES.map((fixture) => {
    const source = signalId(fixture.signalKey)
    const config = configId(fixture.kind)
    const idempotencyKey = `${fixture.kind}:${config}:${fixture.trigger}:${source}:${fixture.idSuffix}`

    return {
      id: scope.cuid(`agent-dispatch:${fixture.key}`),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      configId: config,
      idempotencyKey,
      trigger: fixture.trigger,
      sourceType: "signal",
      sourceId: source,
      claimedAt: scope.dateDaysAgo(fixture.claimedDaysAgo, fixture.claimedHour, 0),
      dispatchedAt:
        fixture.dispatchedDaysAgo === undefined
          ? null
          : scope.dateDaysAgo(fixture.dispatchedDaysAgo, fixture.claimedHour, 5),
      externalAgentId: fixture.externalAgentId ?? null,
      externalRunId: null,
      externalUrl: fixture.externalUrl ?? null,
      status: fixture.status,
      errorCategory: fixture.errorCategory ?? null,
      errorDetail: fixture.errorDetail ?? null,
    }
  })
}

const seedAgentDispatches: Seeder = {
  name: "agent-dispatch/signal-dispatch-history",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const rows = buildAgentDispatchRows(ctx)
        for (const row of rows) {
          const { id, ...set } = row
          await ctx.db.insert(agentDispatches).values(row).onConflictDoUpdate({
            target: agentDispatches.id,
            set,
          })
        }
        console.log(`  -> agent dispatches: ${rows.length} signal dispatch events`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed agent dispatches", cause: error }),
    }).pipe(Effect.asVoid),
}

export const agentDispatchSeeders: readonly Seeder[] = [seedAgentDispatches]
