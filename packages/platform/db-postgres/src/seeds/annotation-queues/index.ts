import { SYSTEM_QUEUE_DEFAULT_SAMPLING, SYSTEM_QUEUE_DEFINITIONS } from "@domain/annotation-queues"
import {
  SEED_ANNOTATION_QUEUE_EMPTY_ID,
  SEED_ANNOTATION_QUEUE_ITEM_COMPLETED_ID,
  SEED_ANNOTATION_QUEUE_ITEM_IN_PROGRESS_ID,
  SEED_ANNOTATION_QUEUE_ITEM_JAIL_444_ID,
  SEED_ANNOTATION_QUEUE_ITEM_LIVE_777_ID,
  SEED_ANNOTATION_QUEUE_ITEM_LIVE_ID,
  SEED_ANNOTATION_QUEUE_ITEM_PENDING_ID,
  SEED_ANNOTATION_QUEUE_ITEM_REFUSAL_A_ID,
  SEED_ANNOTATION_QUEUE_ITEM_REFUSAL_B_ID,
  SEED_ANNOTATION_QUEUE_ITEM_STATUS_COMPLETED_ID,
  SEED_ANNOTATION_QUEUE_ITEM_STATUS_PENDING_ID,
  SEED_ANNOTATION_QUEUE_ITEM_STATUS_PROGRESS_ID,
  SEED_ANNOTATION_QUEUE_ITEM_SYSTEM_ID,
  SEED_ANNOTATION_QUEUE_ITEM_WEEKLY_A_ID,
  SEED_ANNOTATION_QUEUE_ITEM_WEEKLY_B_ID,
  SEED_ANNOTATION_QUEUE_LIVE_ID,
  SEED_ANNOTATION_QUEUE_MANUAL_ID,
  SEED_ANNOTATION_QUEUE_REFUSAL_ID,
  SEED_ANNOTATION_QUEUE_STATUS_DEMO_ID,
  SEED_ANNOTATION_QUEUE_SYSTEM_ID,
  SEED_ANNOTATION_QUEUE_WEEKLY_ID,
  SEED_CANONICAL_TRACE_IDS,
  SEED_MANUAL_QUEUE_ASSIGNEES,
  SEED_MEMBER_1_USER_ID,
  SEED_ORG_ID,
  SEED_OWNER_USER_ID,
  SEED_PROJECT_ID,
} from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"
import { annotationQueueItems, annotationQueues } from "../../schema/annotation-queues.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const [defJailbreaking, defRefusal] = SYSTEM_QUEUE_DEFINITIONS

/** Stable aliases for the seven CH-aligned seed traces (see `SEED_CANONICAL_TRACE_IDS`). */
const T = {
  t111: SEED_CANONICAL_TRACE_IDS[0] ?? "11111111111111111111111111111111",
  t222: SEED_CANONICAL_TRACE_IDS[1] ?? "22222222222222222222222222222222",
  t333: SEED_CANONICAL_TRACE_IDS[2] ?? "33333333333333333333333333333333",
  t666: SEED_CANONICAL_TRACE_IDS[3] ?? "66666666666666666666666666666666",
  t444: SEED_CANONICAL_TRACE_IDS[4] ?? "44444444444444444444444444444444",
  t555: SEED_CANONICAL_TRACE_IDS[5] ?? "55555555555555555555555555555555",
  t777: SEED_CANONICAL_TRACE_IDS[6] ?? "77777777777777777777777777777777",
} as const

const queueRows = [
  // Oldest first — list UI sorts `created_at DESC`
  {
    id: SEED_ANNOTATION_QUEUE_EMPTY_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    system: false,
    name: "Empty backlog (demo)",
    description: "Intentionally has no items so the items table can show an empty state.",
    instructions: "No action — this queue exists only for UI edge-case testing.",
    settings: {},
    assignees: [] as string[],
    totalItems: 0,
    completedItems: 0,
    deletedAt: null,
    createdAt: new Date("2026-03-19T10:00:00.000Z"),
    updatedAt: new Date("2026-03-19T10:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_STATUS_DEMO_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    system: false,
    name: "All item statuses (demo)",
    description: "Exactly one pending, one in progress, and one completed row for local UI testing.",
    instructions: "Compare status badges and the completed-by column across the three rows.",
    settings: {},
    assignees: [SEED_OWNER_USER_ID],
    totalItems: 3,
    completedItems: 1,
    deletedAt: null,
    createdAt: new Date("2026-03-19T11:30:00.000Z"),
    updatedAt: new Date("2026-03-19T11:30:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_MANUAL_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    system: false,
    name: "Review Edge Cases",
    description: "Manually curated traces that need careful human review",
    instructions:
      "Review each trace for correctness and adherence to product policy. Mark any issues with detailed feedback.",
    settings: {},
    assignees: [...SEED_MANUAL_QUEUE_ASSIGNEES],
    totalItems: 3,
    completedItems: 1,
    deletedAt: null,
    createdAt: new Date("2026-03-20T08:00:00.000Z"),
    updatedAt: new Date("2026-03-20T08:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_SYSTEM_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    system: true,
    name: defJailbreaking.name,
    description: defJailbreaking.description,
    instructions: defJailbreaking.instructions,
    settings: { sampling: SYSTEM_QUEUE_DEFAULT_SAMPLING },
    assignees: [] as string[],
    totalItems: 2,
    completedItems: 0,
    deletedAt: null,
    createdAt: new Date("2026-03-20T08:30:00.000Z"),
    updatedAt: new Date("2026-03-20T08:30:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_LIVE_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    system: false,
    name: "High Cost Traces",
    description: "Traces with cost exceeding threshold, populated by live filter",
    instructions: "Review high-cost traces for optimization opportunities or unnecessary token usage.",
    settings: {
      filter: { cost: [{ op: "gte" as const, value: 500 }] },
      sampling: 25,
    },
    assignees: [SEED_OWNER_USER_ID],
    totalItems: 2,
    completedItems: 0,
    deletedAt: null,
    createdAt: new Date("2026-03-21T10:00:00.000Z"),
    updatedAt: new Date("2026-03-21T10:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_REFUSAL_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    system: true,
    name: defRefusal.name,
    description: defRefusal.description,
    instructions: defRefusal.instructions,
    settings: { sampling: SYSTEM_QUEUE_DEFAULT_SAMPLING },
    assignees: [] as string[],
    totalItems: 2,
    completedItems: 1,
    deletedAt: null,
    createdAt: new Date("2026-03-21T14:00:00.000Z"),
    updatedAt: new Date("2026-03-21T14:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_WEEKLY_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    system: false,
    name: "Weekly quality sample",
    description: "Rotating sample of traces for weekly human calibration.",
    instructions: "Spot-check model behavior against internal quality rubric; note regressions.",
    settings: {},
    assignees: [SEED_OWNER_USER_ID],
    totalItems: 2,
    completedItems: 0,
    deletedAt: null,
    createdAt: new Date("2026-03-22T09:00:00.000Z"),
    updatedAt: new Date("2026-03-22T09:00:00.000Z"),
  },
]

const queueItemRows = [
  // Manual — pending / in_progress / completed
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_PENDING_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_MANUAL_ID,
    traceId: T.t333,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-20T09:00:00.000Z"),
    updatedAt: new Date("2026-03-20T09:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_IN_PROGRESS_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_MANUAL_ID,
    traceId: T.t222,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: new Date("2026-03-20T10:15:00.000Z"),
    createdAt: new Date("2026-03-20T09:45:00.000Z"),
    updatedAt: new Date("2026-03-20T10:15:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_COMPLETED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_MANUAL_ID,
    traceId: T.t111,
    completedAt: new Date("2026-03-20T12:00:00.000Z"),
    completedBy: SEED_OWNER_USER_ID,
    reviewStartedAt: new Date("2026-03-20T11:00:00.000Z"),
    createdAt: new Date("2026-03-20T09:30:00.000Z"),
    updatedAt: new Date("2026-03-20T12:00:00.000Z"),
  },
  // Status demo — pending / in progress / completed (one row each)
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_STATUS_PENDING_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_STATUS_DEMO_ID,
    traceId: T.t666,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-19T11:35:00.000Z"),
    updatedAt: new Date("2026-03-19T11:35:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_STATUS_PROGRESS_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_STATUS_DEMO_ID,
    traceId: T.t777,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: new Date("2026-03-19T11:40:00.000Z"),
    createdAt: new Date("2026-03-19T11:36:00.000Z"),
    updatedAt: new Date("2026-03-19T11:40:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_STATUS_COMPLETED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_STATUS_DEMO_ID,
    traceId: T.t555,
    completedAt: new Date("2026-03-19T11:45:00.000Z"),
    completedBy: SEED_MEMBER_1_USER_ID,
    reviewStartedAt: new Date("2026-03-19T11:42:00.000Z"),
    createdAt: new Date("2026-03-19T11:37:00.000Z"),
    updatedAt: new Date("2026-03-19T11:45:00.000Z"),
  },
  // Jailbreaking — two pending
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_SYSTEM_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_SYSTEM_ID,
    traceId: T.t555,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-21T11:00:00.000Z"),
    updatedAt: new Date("2026-03-21T11:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_JAIL_444_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_SYSTEM_ID,
    traceId: T.t444,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-21T11:30:00.000Z"),
    updatedAt: new Date("2026-03-21T11:30:00.000Z"),
  },
  // Live — two pending (same traces may appear in other queues; unique is per-queue)
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_LIVE_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_LIVE_ID,
    traceId: T.t666,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-22T14:00:00.000Z"),
    updatedAt: new Date("2026-03-22T14:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_LIVE_777_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_LIVE_ID,
    traceId: T.t777,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-22T15:00:00.000Z"),
    updatedAt: new Date("2026-03-22T15:00:00.000Z"),
  },
  // Refusal — one completed, one pending
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_REFUSAL_A_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_REFUSAL_ID,
    traceId: T.t333,
    completedAt: new Date("2026-03-21T16:00:00.000Z"),
    completedBy: SEED_OWNER_USER_ID,
    reviewStartedAt: new Date("2026-03-21T15:30:00.000Z"),
    createdAt: new Date("2026-03-21T15:00:00.000Z"),
    updatedAt: new Date("2026-03-21T16:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_REFUSAL_B_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_REFUSAL_ID,
    traceId: T.t666,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-21T16:30:00.000Z"),
    updatedAt: new Date("2026-03-21T16:30:00.000Z"),
  },
  // Weekly — two pending
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_WEEKLY_A_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_WEEKLY_ID,
    traceId: T.t222,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-22T10:00:00.000Z"),
    updatedAt: new Date("2026-03-22T10:00:00.000Z"),
  },
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_WEEKLY_B_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_WEEKLY_ID,
    traceId: T.t777,
    completedAt: null,
    completedBy: null,
    reviewStartedAt: null,
    createdAt: new Date("2026-03-22T11:00:00.000Z"),
    updatedAt: new Date("2026-03-22T11:00:00.000Z"),
  },
]

const seedAnnotationQueues: Seeder = {
  name: "annotation-queues/queue-shapes",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const queueIdMap = new Map<string, string>()

        for (const row of queueRows) {
          const { id, ...set } = row
          const [existing] = await ctx.db
            .select({ id: annotationQueues.id })
            .from(annotationQueues)
            .where(
              and(
                eq(annotationQueues.organizationId, row.organizationId),
                eq(annotationQueues.projectId, row.projectId),
                eq(annotationQueues.name, row.name),
                isNull(annotationQueues.deletedAt),
              ),
            )
            .limit(1)

          if (existing && existing.id !== id) {
            await ctx.db.update(annotationQueues).set(set).where(eq(annotationQueues.id, existing.id))
            queueIdMap.set(id, existing.id)
          } else {
            await ctx.db.insert(annotationQueues).values(row).onConflictDoUpdate({ target: annotationQueues.id, set })
            queueIdMap.set(id, id)
          }
        }

        for (const row of queueItemRows) {
          const { id, ...set } = row
          const resolvedQueueId = queueIdMap.get(row.queueId) ?? row.queueId
          const resolvedRow = { ...row, queueId: resolvedQueueId }
          const resolvedSet = { ...set, queueId: resolvedQueueId }

          const [existing] = await ctx.db
            .select({ id: annotationQueueItems.id })
            .from(annotationQueueItems)
            .where(
              and(
                eq(annotationQueueItems.organizationId, row.organizationId),
                eq(annotationQueueItems.projectId, row.projectId),
                eq(annotationQueueItems.queueId, resolvedQueueId),
                eq(annotationQueueItems.traceId, row.traceId),
              ),
            )
            .limit(1)

          if (existing && existing.id !== id) {
            await ctx.db.update(annotationQueueItems).set(resolvedSet).where(eq(annotationQueueItems.id, existing.id))
          } else {
            await ctx.db
              .insert(annotationQueueItems)
              .values(resolvedRow)
              .onConflictDoUpdate({ target: annotationQueueItems.id, set: resolvedSet })
          }
        }

        console.log(
          `  -> annotation queues: ${queueRows.length} queues, ${queueItemRows.length} items (canonical trace ids → CH seed remap)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed annotation queues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const annotationQueueSeeders: readonly Seeder[] = [seedAnnotationQueues]
