import { ApiKeyRepository, generateApiKeyUseCase } from "@domain/api-keys"
import { OutboxEventWriter } from "@domain/events"
import { createProject, ProjectRepository } from "@domain/projects"
import type { QueueConsumer } from "@domain/queue"
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
import { getPostgresClient, getWorkflowStarter } from "../clients.ts"

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
export const createShowcaseWorker = ({ consumer, postgresClient }: ShowcaseDeps) => {
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

        // Self-heal a wedged build under a row lock: a `building` pointer older
        // than the stale threshold (its Temporal start failed) is reset to idle
        // so the next regeneration provisions fresh instead of resuming a dead
        // run. A healthy in-flight build is left untouched. The pointer table has
        // no RLS, so this needs no org scope. `find` first so a missing showcase
        // is a clean skip rather than a `ShowcaseNotFoundError`.
        const reclaimed = yield* Effect.gen(function* () {
          const repo = yield* ShowcaseRepository
          const showcase = yield* repo.find()
          if (!showcase) return null
          return yield* repo.reclaimStaleBuild(new Date(now.getTime() - SHOWCASE_BUILD_STALE_AFTER_MS))
        }).pipe(withPostgres(ShowcaseRepositoryLive, pgClient))

        if (!reclaimed) {
          logger.info("No showcase exists — skipping cleanup")
          return
        }
        if (reclaimed.reclaimedProjectId) {
          logger.warn("Reclaimed stale showcase build", {
            organizationId: reclaimed.showcase.organizationId,
            reclaimedProjectId: reclaimed.reclaimedProjectId,
          })
        }

        const organizationId = reclaimed.showcase.organizationId

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
            currentProjectId: reclaimed.showcase.currentProjectId,
            nextProjectId: reclaimed.showcase.nextProjectId,
            now,
            retireGraceMs: SHOWCASE_RETIRE_GRACE_MS,
          })
          if (retirable.length === 0) return retirable

          yield* sqlClient.transaction(
            Effect.gen(function* () {
              for (const projectId of retirable) {
                yield* projectRepo.softDelete(projectId)
                yield* outbox
                  .write({
                    eventName: "ProjectDeleted",
                    aggregateType: "project",
                    aggregateId: projectId,
                    organizationId,
                    payload: { organizationId, actorUserId: "", projectId },
                  })
                  .pipe(Effect.mapError((cause) => new Error(`ProjectDeleted outbox write failed: ${String(cause)}`)))
              }
            }),
          )
          return retirable
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
