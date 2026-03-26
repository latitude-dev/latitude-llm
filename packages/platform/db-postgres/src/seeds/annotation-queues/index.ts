import { SYSTEM_QUEUE_DEFAULT_SAMPLING } from "@domain/annotation-queues"
import {
  SEED_ANNOTATION_QUEUE_ITEM_COMPLETED_ID,
  SEED_ANNOTATION_QUEUE_ITEM_LIVE_ID,
  SEED_ANNOTATION_QUEUE_ITEM_PENDING_ID,
  SEED_ANNOTATION_QUEUE_ITEM_SYSTEM_ID,
  SEED_ANNOTATION_QUEUE_LIVE_ID,
  SEED_ANNOTATION_QUEUE_MANUAL_ID,
  SEED_ANNOTATION_QUEUE_SYSTEM_ID,
  SEED_ORG_ID,
  SEED_OWNER_USER_ID,
  SEED_PROJECT_ID,
} from "@domain/shared"
import { Effect } from "effect"
import { annotationQueueItems, annotationQueues } from "../../schema/annotation-queues.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const queueRows = [
  // Manual queue (user-created, no filter)
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
    assignees: [SEED_OWNER_USER_ID],
    deletedAt: null,
    createdAt: new Date("2026-03-20T08:00:00.000Z"),
    updatedAt: new Date("2026-03-20T08:00:00.000Z"),
  },
  // System queue (system-created manual, Jailbreaking)
  {
    id: SEED_ANNOTATION_QUEUE_SYSTEM_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    system: true,
    name: "Jailbreaking",
    description: "attempts to bypass system or safety constraints",
    instructions:
      "use this queue for prompt injection, instruction hierarchy attacks, policy-evasion attempts, tool abuse intended to bypass guardrails, role or identity escape attempts, or assistant behavior that actually follows those bypass attempts. Do not use it for harmless roleplay or ordinary unsafe requests that the assistant correctly refuses.",
    settings: { sampling: SYSTEM_QUEUE_DEFAULT_SAMPLING },
    assignees: [],
    deletedAt: null,
    createdAt: new Date("2026-03-20T08:00:00.000Z"),
    updatedAt: new Date("2026-03-20T08:00:00.000Z"),
  },
  // Live queue (filter-based)
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
    deletedAt: null,
    createdAt: new Date("2026-03-21T10:00:00.000Z"),
    updatedAt: new Date("2026-03-21T10:00:00.000Z"),
  },
]

const queueItemRows = [
  // Pending item in manual queue
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_PENDING_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_MANUAL_ID,
    traceId: "33333333333333333333333333333333",
    completedAt: null,
    createdAt: new Date("2026-03-20T09:00:00.000Z"),
    updatedAt: new Date("2026-03-20T09:00:00.000Z"),
  },
  // Completed item in manual queue
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_COMPLETED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_MANUAL_ID,
    traceId: "11111111111111111111111111111111",
    completedAt: new Date("2026-03-20T12:00:00.000Z"),
    createdAt: new Date("2026-03-20T09:30:00.000Z"),
    updatedAt: new Date("2026-03-20T12:00:00.000Z"),
  },
  // Item in system queue (added by system-annotation-queues:annotate)
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_SYSTEM_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_SYSTEM_ID,
    traceId: "55555555555555555555555555555555",
    completedAt: null,
    createdAt: new Date("2026-03-21T11:00:00.000Z"),
    updatedAt: new Date("2026-03-21T11:00:00.000Z"),
  },
  // Item in live queue (materialized by live-annotation-queues:curate)
  {
    id: SEED_ANNOTATION_QUEUE_ITEM_LIVE_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    queueId: SEED_ANNOTATION_QUEUE_LIVE_ID,
    traceId: "66666666666666666666666666666666",
    completedAt: null,
    createdAt: new Date("2026-03-22T14:00:00.000Z"),
    updatedAt: new Date("2026-03-22T14:00:00.000Z"),
  },
]

const seedAnnotationQueues: Seeder = {
  name: "annotation-queues/queue-shapes",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        for (const row of queueRows) {
          const { id, ...set } = row
          await ctx.db.insert(annotationQueues).values(row).onConflictDoUpdate({
            target: annotationQueues.id,
            set,
          })
        }

        for (const row of queueItemRows) {
          const { id, ...set } = row
          await ctx.db.insert(annotationQueueItems).values(row).onConflictDoUpdate({
            target: annotationQueueItems.id,
            set,
          })
        }

        console.log(
          `  -> annotation queues: ${queueRows.length} queues (manual, system, live), ${queueItemRows.length} items`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed annotation queues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const annotationQueueSeeders: readonly Seeder[] = [seedAnnotationQueues]
