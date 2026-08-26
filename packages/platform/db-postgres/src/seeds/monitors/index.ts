import { Effect } from "effect"
import { monitors } from "../../schema/monitors.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const buildMonitorRows = (ctx: SeedContext): (typeof monitors.$inferInsert)[] => {
  const now = ctx.scope.dateDaysAgo(0, 10, 0)

  return [
    {
      id: ctx.scope.cuid("monitor:warranty-regressions"),
      organizationId: ctx.scope.organizationId,
      projectId: ctx.scope.projectId,
      slug: "warranty-regressions",
      name: "Warranty regressions",
      description: "Notify when warranty-related feedback spikes above the expected baseline.",
      system: false,
      targetType: "user",
      targetId: null,
      trigger: "escalating",
      config: {
        query: "warranty OR replacement",
        metric: { kind: "count" },
        condition: {
          trigger: "escalating",
          metric: { kind: "count" },
          threshold: { mode: "expected", sensitivity: 3 },
        },
      },
      severity: "high",
      lastEvaluatedAt: null,
      mutedAt: null,
      deletedAt: null,
      createdAt: ctx.scope.dateDaysAgo(13, 9, 0),
      updatedAt: now,
    },
    {
      id: ctx.scope.cuid("monitor:slow-support-sessions"),
      organizationId: ctx.scope.organizationId,
      projectId: ctx.scope.projectId,
      slug: "slow-support-sessions",
      name: "Slow support sessions",
      description: "Notify when customer support sessions take longer than expected.",
      system: false,
      targetType: "session",
      targetId: null,
      trigger: "threshold",
      config: {
        metric: { kind: "avg", field: "duration" },
        condition: {
          trigger: "threshold",
          metric: { kind: "avg", field: "duration" },
          threshold: { mode: "absolute", value: 45_000 },
          direction: "above",
        },
      },
      severity: "medium",
      lastEvaluatedAt: null,
      mutedAt: null,
      deletedAt: null,
      createdAt: ctx.scope.dateDaysAgo(12, 11, 0),
      updatedAt: now,
    },
    {
      id: ctx.scope.cuid("monitor:tool-error-rate"),
      organizationId: ctx.scope.organizationId,
      projectId: ctx.scope.projectId,
      slug: "tool-error-rate",
      name: "Tool error rate",
      description: "Notify when tool calls fail at an elevated rate.",
      system: false,
      targetType: "tool",
      targetId: null,
      trigger: "threshold",
      config: {
        metric: { kind: "errorRate" },
        condition: {
          trigger: "threshold",
          metric: { kind: "errorRate" },
          threshold: { mode: "absolute", value: 0.1 },
          direction: "above",
        },
      },
      severity: "medium",
      lastEvaluatedAt: null,
      mutedAt: null,
      deletedAt: null,
      createdAt: ctx.scope.dateDaysAgo(11, 14, 0),
      updatedAt: now,
    },
  ]
}

const seedMonitors: Seeder = {
  name: "monitors/demo-project-monitors",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const rows = buildMonitorRows(ctx)
        for (const row of rows) {
          const { id, ...set } = row
          await ctx.db.insert(monitors).values(row).onConflictDoUpdate({
            target: monitors.id,
            set,
          })
        }
        console.log(`  -> monitors: ${rows.length} demo project monitors`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed monitors", cause: error }),
    }).pipe(Effect.asVoid),
}

export const monitorSeeders: readonly Seeder[] = [seedMonitors]
