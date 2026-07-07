import { ApiKeyRepository, generateApiKeyUseCase } from "@domain/api-keys"
import { OutboxEventWriter } from "@domain/events"
import { createProject, ProjectRepository } from "@domain/projects"
import { isWorkflowAliveUseCase, type QueueConsumer, WorkflowQuerier, type WorkflowQuerierShape } from "@domain/queue"
import { generateSlug, SqlClient } from "@domain/shared"
import {
  SHOWCASE_BUILD_STALE_AFTER_MS,
  SHOWCASE_RETIRE_GRACE_MS,
  type Showcase,
  ShowcaseRepository,
  selectRetirableShowcaseProjectIds,
} from "@domain/showcase"
import {
  ApiKeyRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  ShowcaseRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient, getWorkflowQuerier, getWorkflowStarter } from "../clients.ts"

const logger = createLogger("showcase")

const SHOWCASE_PROJECT_NAME = "Latitude Demo"
const SHOWCASE_SEED_API_KEY_NAME = "Showcase seed"
const REGENERATE_WORKFLOW_ID = "showcase:regenerate"

interface PreparedRegeneration {
  readonly organizationId: string
  readonly projectId: string
  readonly apiKeyId: string
  readonly timelineAnchorIso: string
}

interface ShowcaseDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
  workflowQuerier?: WorkflowQuerierShape
}

/**
 * Daily off-peak regeneration of the shared read-only Showcase (S4).
 *
 * The handler owns the *begin* half of the blue/green cycle — resolve the
 * showcase org from the pointer, provision a fresh `next` project (marked
 * `isShowcase` so gardening/retention skip it) plus the api key the seed
 * needs, and flip the pointer to `building`. It then starts
 * `regenerateShowcaseWorkflow`, which drives build → gate → atomic swap.
 *
 * Guards that make this safe to fire on a schedule:
 * - No showcase yet → skip (nothing to regenerate; S1 create hasn't run).
 * - A build already named on the pointer (`next_project_id` set) → *resume* it
 *   rather than provisioning a new one: re-drive the existing `next` through an
 *   idempotent workflow start (a genuinely in-flight run dedups via
 *   `workflowId`). This keeps a transient failure between `beginNextBuild` and a
 *   durable workflow start from wedging the pointer in `building` forever.
 */
export const createShowcaseWorker = ({ consumer, postgresClient, workflowQuerier }: ShowcaseDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()

  consumer.subscribe("showcase", {
    regenerate: () =>
      Effect.gen(function* () {
        const timelineAnchorIso = new Date().toISOString()

        // Pointer table has no RLS (system/config), so a plain read resolves the
        // showcase org without an org scope.
        const showcase = yield* Effect.gen(function* () {
          const repo = yield* ShowcaseRepository
          return yield* repo.find()
        }).pipe(withPostgres(ShowcaseRepositoryLive, pgClient))

        if (!showcase) {
          logger.info("No showcase exists — skipping regeneration")
          return
        }

        const organizationId = showcase.organizationId

        // Resume an existing `next` or provision a fresh one, flipping to
        // `building` in one transaction so a crash never leaves a project without
        // a pointer entry (or vice versa). Scoped to the showcase org so RLS
        // admits the project/api-key inserts and `list()` only sees its keys.
        const prepared = yield* prepareRegeneration(showcase, timelineAnchorIso).pipe(
          withPostgres(
            Layer.mergeAll(ShowcaseRepositoryLive, ProjectRepositoryLive, ApiKeyRepositoryLive, OutboxEventWriterLive),
            pgClient,
            organizationId,
          ),
        )

        const workflowStarter = yield* Effect.promise(() => getWorkflowStarter())
        yield* workflowStarter
          .start("regenerateShowcaseWorkflow", prepared, { workflowId: REGENERATE_WORKFLOW_ID })
          .pipe(
            Effect.catchTag("WorkflowAlreadyStartedError", () =>
              Effect.sync(() => logger.info("Showcase regeneration already running — skipping duplicate start")),
            ),
          )

        logger.info("Showcase regeneration started", {
          organizationId,
          nextProjectId: prepared.projectId,
        })
      }).pipe(withTracing),

    cleanup: () =>
      Effect.gen(function* () {
        const now = new Date()

        // The pointer table has no RLS, so this reads without an org scope. `find`
        // first so a missing showcase is a clean skip rather than a
        // `ShowcaseNotFoundError`.
        const staleBefore = new Date(now.getTime() - SHOWCASE_BUILD_STALE_AFTER_MS)
        const showcase = yield* Effect.gen(function* () {
          const repo = yield* ShowcaseRepository
          return yield* repo.find()
        }).pipe(withPostgres(ShowcaseRepositoryLive, pgClient))

        if (!showcase) {
          logger.info("No showcase exists — skipping cleanup")
          return
        }

        // Self-heal a wedged build: a `building` pointer past the stale threshold
        // is a candidate for reclaim, but only once its regeneration workflow is
        // provably done. `updatedAt` is NOT heartbeated while the workflow runs,
        // so a slow / retrying / paused-then-resumed run can look stale while
        // still live — reclaiming under it would yank the `next` it later
        // mark/swaps. Gate on the workflow's terminal status; a still-live run is
        // left for the next sweep. The subsequent `reclaimStaleBuild` re-checks
        // staleness under a row lock, so this snapshot only decides whether to
        // attempt the reclaim at all.
        let pointer = showcase
        const looksStale =
          showcase.nextState === "building" && !!showcase.nextProjectId && showcase.updatedAt < staleBefore
        if (looksStale) {
          const querier = workflowQuerier ?? (yield* Effect.promise(() => getWorkflowQuerier()))
          const workflowAlive = yield* isWorkflowAliveUseCase(REGENERATE_WORKFLOW_ID).pipe(
            Effect.provideService(WorkflowQuerier, querier),
          )

          if (workflowAlive) {
            logger.info("Stale showcase build, but its regeneration workflow is still live — not reclaiming", {
              organizationId: showcase.organizationId,
              nextProjectId: showcase.nextProjectId,
            })
          } else {
            const reclaimed = yield* Effect.gen(function* () {
              const repo = yield* ShowcaseRepository
              return yield* repo.reclaimStaleBuild(staleBefore)
            }).pipe(withPostgres(ShowcaseRepositoryLive, pgClient))
            pointer = reclaimed.showcase
            if (reclaimed.reclaimedProjectId) {
              logger.warn("Reclaimed stale showcase build", {
                organizationId: reclaimed.showcase.organizationId,
                reclaimedProjectId: reclaimed.reclaimedProjectId,
              })
            }
          }
        }

        const organizationId = pointer.organizationId

        // Soft-delete + emit `ProjectDeleted` for every orphan (neither current
        // nor next, past the grace window) in one transaction, scoped to the
        // showcase org so RLS admits the reads/writes. This is the same deletion
        // path any project takes: `ProjectDeleted` drives the per-project cascade
        // and the row's ClickHouse telemetry ages out via the table-level
        // retention TTL — the showcase is not special-cased into a manual purge.
        const retiredProjectIds = yield* Effect.gen(function* () {
          const projectRepo = yield* ProjectRepository
          const outbox = yield* OutboxEventWriter
          const sqlClient = yield* SqlClient
          const projects = yield* projectRepo.list()
          const retirable = selectRetirableShowcaseProjectIds({
            projects,
            currentProjectId: pointer.currentProjectId,
            nextProjectId: pointer.nextProjectId,
            now,
            retireGraceMs: SHOWCASE_RETIRE_GRACE_MS,
          })
          if (retirable.length === 0) return []

          const retired: string[] = []
          yield* sqlClient.transaction(
            Effect.gen(function* () {
              for (const projectId of retirable) {
                // Idempotent: a concurrent sweep (cron vs post-swap) or an admin
                // action may have already soft-deleted this project between the
                // `list()` above and here. `softDelete` reports that as a logical
                // 0-row `NotFoundError` (the UPDATE still succeeds, so the
                // transaction isn't poisoned) — skip it and its `ProjectDeleted`
                // emit, which the winning sweep already wrote.
                const deleted = yield* projectRepo.softDelete(projectId).pipe(
                  Effect.as(true),
                  Effect.catchTag("NotFoundError", () => Effect.succeed(false)),
                )
                if (!deleted) continue

                yield* outbox
                  .write({
                    eventName: "ProjectDeleted",
                    aggregateType: "project",
                    aggregateId: projectId,
                    organizationId,
                    payload: { organizationId, actorUserId: "", projectId },
                  })
                  .pipe(Effect.mapError((cause) => new Error(`ProjectDeleted outbox write failed: ${String(cause)}`)))
                retired.push(projectId)
              }
            }),
          )
          return retired
        }).pipe(withPostgres(Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive), pgClient, organizationId))

        if (retiredProjectIds.length > 0) {
          logger.info("Retired showcase projects", { organizationId, retiredProjectIds })
        }
      }).pipe(withTracing),
  })
}

const prepareRegeneration = (showcase: Showcase, timelineAnchorIso: string) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const organizationId = sqlClient.organizationId

        // Seeded ClickHouse spans reference an api key that must exist on the
        // showcase org. Reuse the org's first key if present; otherwise mint one.
        const apiKeyRepo = yield* ApiKeyRepository
        const existingKeys = yield* apiKeyRepo.list()
        const existingKey = existingKeys[0]
        const apiKeyId = existingKey
          ? existingKey.id
          : (yield* generateApiKeyUseCase({ name: SHOWCASE_SEED_API_KEY_NAME, isSandbox: false, organizationId })).id

        // Resume: the pointer already names a `next` (a previous run that never
        // reached a durable workflow start, or is genuinely in flight). Re-drive
        // that same project — the workflow start is idempotent, so this is a no-op
        // for a running build and un-wedges a stalled one. Don't provision a new
        // project (that would orphan the existing `next`).
        if (showcase.nextProjectId) {
          return {
            organizationId,
            projectId: showcase.nextProjectId,
            apiKeyId,
            timelineAnchorIso,
          } satisfies PreparedRegeneration
        }

        const projectRepo = yield* ProjectRepository
        const slug = yield* generateSlug({
          name: SHOWCASE_PROJECT_NAME,
          count: (candidate) => projectRepo.countBySlug(candidate),
        })
        const project = createProject({
          organizationId,
          name: SHOWCASE_PROJECT_NAME,
          slug,
          settings: { isShowcase: true },
        })
        yield* projectRepo.save(project)

        const showcaseRepo = yield* ShowcaseRepository
        yield* showcaseRepo.beginNextBuild(project.id)

        return {
          organizationId,
          projectId: project.id,
          apiKeyId,
          timelineAnchorIso,
        } satisfies PreparedRegeneration
      }),
    )
  })
