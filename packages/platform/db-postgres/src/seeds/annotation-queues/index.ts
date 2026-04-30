import { AnnotationQueueId, AnnotationQueueItemId } from "@domain/shared"
import type { SeedScope } from "@domain/shared/seeding"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { Effect } from "effect"
import { annotationQueueItems, annotationQueues } from "../../schema/annotation-queues.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

type AnnotationQueueRow = typeof annotationQueues.$inferInsert
type AnnotationQueueItemRow = typeof annotationQueueItems.$inferInsert

// Stale queue names left from older seed runs that we want the bootstrap
// seeder to clear out when re-running. The system "Frustration" queue is
// included here because main's PR #2896 replaced system annotation queues
// with per-project flaggers (now seeded via `flaggers/index.ts`).
const staleQueueNames = [
  "Empty backlog (demo)",
  "All item statuses (demo)",
  "Frustration",
  "Review Edge Cases",
  "Refusal",
  "Weekly quality sample",
] as const

/**
 * Pick the `index`-th member of the scope's assignee list, wrapping. Used
 * everywhere the seeders previously hardcoded `SEED_OWNER_USER_ID` /
 * `SEED_ADMIN_USER_ID` — those literal ids only exist on the canonical
 * bootstrap org, so a demo project on any other org would write rows
 * referencing non-existent users (the schema has no FK on
 * `assignees`/`completedBy`, so inserts succeed but the UI shows broken
 * lookups). The bootstrap path keeps owner/admin verbatim because
 * `bootstrapSeedScope.queueAssigneeUserIds[0] === SEED_OWNER_USER_ID` and
 * `[1] === SEED_ADMIN_USER_ID`. The demo path passes a single picked
 * member, and the modulo wraps every reference back to that user.
 */
function pickAssignee(scope: SeedScope, index: number): string {
  const list = scope.queueAssigneeUserIds
  // queueAssigneeUserIds is non-empty by SeedScope construction
  // biome-ignore lint/style/noNonNullAssertion: contract-guaranteed
  return list[index % list.length]!
}

function buildQueueRows(scope: SeedScope) {
  const queueDate = (daysAgo: number, hour: number, minute = 0): Date => scope.dateDaysAgo(daysAgo, hour, minute)
  const assignee = (index: number) => pickAssignee(scope, index)

  return [
    {
      id: AnnotationQueueId(scope.cuid("queue:warranty")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      system: false,
      name: "Warranty Claim Review",
      slug: "warranty-claim-review",
      description:
        "Manual review queue for traces where customers ask for warranty coverage, exclusions, or claim outcomes.",
      instructions:
        "Review whether the assistant fabricated coverage, reimbursement, or an unsupported waiver. Mark failed when " +
        "the agent turns an excluded misuse scenario into a covered claim. Mark passed when the assistant keeps the " +
        "outcome conditional, cites policy, or limits any exception to a documented approval.",
      settings: {},
      assignees: [assignee(0), assignee(1)],
      totalItems: 3,
      completedItems: 2,
      deletedAt: null,
      createdAt: queueDate(12, 8),
      updatedAt: queueDate(12, 8),
    },
    {
      id: AnnotationQueueId(scope.cuid("queue:combination")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      system: false,
      name: "Combination Safety Review",
      slug: "combination-safety-review",
      description:
        "Manual review queue for traces where the assistant discussed combining Acme products or handling requests for exceptions.",
      instructions:
        "Review each trace for unsafe product-combination advice. Mark failed when the assistant recommends or approves " +
        "an uncertified combination. Mark passed when the assistant refuses the request, cites the policy, or correctly " +
        "distinguishes an officially tested bundle or a narrowly scoped authorization.",
      settings: {},
      assignees: [...scope.queueAssigneeUserIds],
      totalItems: 3,
      completedItems: 2,
      deletedAt: null,
      createdAt: queueDate(7, 8),
      updatedAt: queueDate(7, 8),
    },
    {
      id: AnnotationQueueId(scope.cuid("queue:logistics")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      system: false,
      name: "Logistics Promise Review",
      slug: "logistics-promise-review",
      description:
        "Manual review queue for new traces where the assistant discusses shipping guarantees, delivery waivers, or pickup options.",
      instructions:
        "Review whether the assistant invented a logistics capability, fee waiver, pickup workflow, or guaranteed delivery outcome. " +
        "Mark failed when the assistant promises unsupported service. Mark passed when it clearly states the supported options or keeps any exception scoped to a verified reference.",
      settings: {},
      assignees: [assignee(0)],
      totalItems: 3,
      completedItems: 2,
      deletedAt: null,
      createdAt: queueDate(3, 8, 15),
      updatedAt: queueDate(3, 8, 15),
    },
    {
      id: AnnotationQueueId(scope.cuid("queue:live")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      system: false,
      name: "High-Cost Traces",
      slug: "high-cost-traces",
      description:
        "Live review queue for unusually expensive support traces so the team can spot over-long or redundant generations.",
      instructions:
        "Review traces with unusually high cost. Check whether token usage is justified by the request, or whether the assistant is " +
        "making redundant calls, over-explaining, or otherwise spending more than necessary.",
      settings: {
        filter: { cost: [{ op: "gte" as const, value: 500 }] },
        sampling: 25,
      },
      assignees: [assignee(0)],
      totalItems: 1,
      completedItems: 0,
      deletedAt: null,
      createdAt: queueDate(4, 10),
      updatedAt: queueDate(4, 10),
    },
    {
      id: AnnotationQueueId(scope.cuid("queue:kitchen-sink")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      system: false,
      name: "Kitchen Sink All Annotations",
      slug: "kitchen-sink-all-annotations",
      description:
        "Demo queue showcasing all annotation features: human/agent/API provenances, draft/published states, global/message/range anchors.",
      instructions:
        "This queue contains a trace with 30+ messages and 12 annotations demonstrating every combination of provenance (human, agent, API), " +
        "state (draft, published), and anchor type (global, message-level, text range selection). Use this queue to test the annotation UI.",
      settings: {},
      assignees: [assignee(0), assignee(1)],
      totalItems: 1,
      completedItems: 0,
      deletedAt: null,
      createdAt: queueDate(1, 8),
      updatedAt: queueDate(1, 8),
    },
  ] satisfies AnnotationQueueRow[]
}

function buildQueueItemRows(scope: SeedScope) {
  const queueDate = (daysAgo: number, hour: number, minute = 0): Date => scope.dateDaysAgo(daysAgo, hour, minute)
  const assignee = (index: number) => pickAssignee(scope, index)
  const queueWarrantyId = AnnotationQueueId(scope.cuid("queue:warranty"))
  const queueCombinationId = AnnotationQueueId(scope.cuid("queue:combination"))
  const queueLogisticsId = AnnotationQueueId(scope.cuid("queue:logistics"))
  const queueLiveId = AnnotationQueueId(scope.cuid("queue:live"))
  const queueKitchenSinkId = AnnotationQueueId(scope.cuid("queue:kitchen-sink"))

  const annotationDemoTraceId = scope.traceHex("annotation-demo", 0)

  return [
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:warranty:pending")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueWarrantyId,
      traceId: scope.traceHex("annotation", 2),
      traceCreatedAt: queueDate(13, 8),
      completedAt: null,
      completedBy: null,
      reviewStartedAt: null,
      createdAt: queueDate(12, 9),
      updatedAt: queueDate(12, 9),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:warranty:completed-a")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueWarrantyId,
      traceId: scope.traceHex("annotation", 0),
      traceCreatedAt: queueDate(13, 7),
      completedAt: queueDate(12, 11, 15),
      completedBy: assignee(0),
      reviewStartedAt: queueDate(12, 10, 30),
      createdAt: queueDate(12, 9, 30),
      updatedAt: queueDate(12, 11, 15),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:warranty:completed-b")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueWarrantyId,
      traceId: scope.traceHex("annotation", 8),
      traceCreatedAt: queueDate(13, 6),
      completedAt: queueDate(12, 12, 5),
      completedBy: assignee(1),
      reviewStartedAt: queueDate(12, 11, 20),
      createdAt: queueDate(12, 9, 45),
      updatedAt: queueDate(12, 12, 5),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:combination:pending")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueCombinationId,
      traceId: scope.traceHex("annotation", 18),
      traceCreatedAt: queueDate(8, 8),
      completedAt: null,
      completedBy: null,
      reviewStartedAt: null,
      createdAt: queueDate(7, 9),
      updatedAt: queueDate(7, 9),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:combination:completed-a")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueCombinationId,
      traceId: scope.traceHex("annotation", 16),
      traceCreatedAt: queueDate(8, 7),
      completedAt: queueDate(7, 11, 40),
      completedBy: assignee(0),
      reviewStartedAt: queueDate(7, 10, 50),
      createdAt: queueDate(7, 9, 20),
      updatedAt: queueDate(7, 11, 40),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:combination:completed-b")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueCombinationId,
      traceId: scope.traceHex("annotation", 28),
      traceCreatedAt: queueDate(8, 6),
      completedAt: queueDate(7, 12, 10),
      completedBy: assignee(0),
      reviewStartedAt: queueDate(7, 11, 15),
      createdAt: queueDate(7, 9, 35),
      updatedAt: queueDate(7, 12, 10),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:logistics:pending")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueLogisticsId,
      traceId: scope.traceHex("annotation", 40),
      traceCreatedAt: queueDate(4, 8),
      completedAt: null,
      completedBy: null,
      reviewStartedAt: queueDate(3, 9, 20),
      createdAt: queueDate(3, 9),
      updatedAt: queueDate(3, 9, 20),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:logistics:completed-a")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueLogisticsId,
      traceId: scope.traceHex("annotation", 38),
      traceCreatedAt: queueDate(4, 7),
      completedAt: queueDate(3, 10, 35),
      completedBy: assignee(0),
      reviewStartedAt: queueDate(3, 9, 40),
      createdAt: queueDate(3, 9, 10),
      updatedAt: queueDate(3, 10, 35),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:logistics:completed-b")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueLogisticsId,
      traceId: scope.traceHex("annotation", 43),
      traceCreatedAt: queueDate(4, 6),
      completedAt: queueDate(3, 11),
      completedBy: assignee(0),
      reviewStartedAt: queueDate(3, 10),
      createdAt: queueDate(3, 9, 15),
      updatedAt: queueDate(3, 11),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:live:pending")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueLiveId,
      traceId: scope.traceHex("annotation", 16),
      traceCreatedAt: queueDate(5, 8),
      completedAt: null,
      completedBy: null,
      reviewStartedAt: null,
      createdAt: queueDate(4, 10, 15),
      updatedAt: queueDate(4, 10, 15),
    },
    {
      id: AnnotationQueueItemId(scope.cuid("queue-item:kitchen-sink")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      queueId: queueKitchenSinkId,
      traceId: annotationDemoTraceId,
      traceCreatedAt: queueDate(2, 8),
      completedAt: null,
      completedBy: null,
      reviewStartedAt: queueDate(1, 9),
      createdAt: queueDate(1, 8, 30),
      updatedAt: queueDate(1, 9),
    },
  ] satisfies AnnotationQueueItemRow[]
}

const seedAnnotationQueues: Seeder = {
  name: "annotation-queues/acme-review-queues",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const queueRows = buildQueueRows(ctx.scope)
        const queueItemRows = buildQueueItemRows(ctx.scope)

        const staleQueues = await ctx.db
          .select({ id: annotationQueues.id })
          .from(annotationQueues)
          .where(
            and(
              eq(annotationQueues.organizationId, ctx.scope.organizationId),
              eq(annotationQueues.projectId, ctx.scope.projectId),
              inArray(annotationQueues.name, [...staleQueueNames]),
              isNull(annotationQueues.deletedAt),
            ),
          )

        if (staleQueues.length > 0) {
          const staleQueueIds = staleQueues.map((queue) => queue.id)
          await ctx.db.delete(annotationQueueItems).where(inArray(annotationQueueItems.queueId, staleQueueIds))
          await ctx.db.delete(annotationQueues).where(inArray(annotationQueues.id, staleQueueIds))
        }

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

        const currentQueueIds = [...queueIdMap.values()]
        if (currentQueueIds.length > 0) {
          await ctx.db.delete(annotationQueueItems).where(inArray(annotationQueueItems.queueId, currentQueueIds))
        }

        for (const row of queueItemRows) {
          const resolvedQueueId = queueIdMap.get(row.queueId) ?? row.queueId
          const resolvedRow = { ...row, queueId: resolvedQueueId }
          await ctx.db
            .insert(annotationQueueItems)
            .values(resolvedRow)
            .onConflictDoUpdate({
              target: annotationQueueItems.id,
              set: {
                queueId: resolvedQueueId,
                traceId: row.traceId,
                traceCreatedAt: row.traceCreatedAt,
                completedAt: row.completedAt,
                completedBy: row.completedBy,
                reviewStartedAt: row.reviewStartedAt,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
              },
            })
        }

        console.log(`  -> annotation queues: ${queueRows.length} queues, ${queueItemRows.length} items`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed annotation queues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const annotationQueueSeeders: readonly Seeder[] = [seedAnnotationQueues]
