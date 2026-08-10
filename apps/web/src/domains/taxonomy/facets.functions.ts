import { QueuePublisher, WorkflowTerminator } from "@domain/queue"
import { CustomBehaviorId, FacetId, ProjectId } from "@domain/shared"
import {
  createFacetBehavior,
  discardBehavior,
  FacetProjectionRepository,
  FacetRepository,
  type FacetSelection,
  facetSelectionSchema,
  newFacetInputSchema,
  type TaxonomyFacet,
} from "@domain/taxonomy"
import { FacetProjectionRepositoryLive, TaxonomyViewAssignmentRepositoryLive } from "@platform/db-clickhouse"
import { CustomBehaviorRepositoryLive, FacetRepositoryLive, TaxonomyClusterRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import {
  getClickhouseClient,
  getPostgresClient,
  getQueuePublisher,
  getWorkflowTerminator,
} from "../../server/clients.ts"
import { resolveOrgScope, type ScopedOrgId } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"
import { type CustomBehaviorRecord, toCustomBehaviorRecord } from "./custom-behaviors.functions.ts"

/**
 * Live cold-start health for a behavior: how many sessions have been analyzed, how
 * many produced a usable answer, and how many distinct answers: enough to judge
 * whether the behavior instructions are working before the tree lands.
 */
interface BehaviorExtractionProgressRecord {
  readonly extractedCount: number
  readonly clearCount: number
  readonly distinctAnswers: number
}

export const facetExtractionProgress = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), facetId: z.string() }))
  .handler(async ({ data, context }): Promise<BehaviorExtractionProgressRecord> => {
    const orgId = await resolveOrgScope(context)
    const facetId = FacetId(data.facetId)
    const projectId = ProjectId(data.projectId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        const health = yield* repo.healthByFacet({ organizationId: orgId, projectId, facetId })
        return { extractedCount: health.analyzed, clearCount: health.clear, distinctAnswers: health.distinctAnswers }
      }).pipe(withScopedClickHouse(FacetProjectionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/** One page of a behavior's extracted answers (newest first), for infinite review while it gardens. */
interface FacetAnswersPageRecord {
  readonly items: readonly { readonly sessionId: string; readonly text: string }[]
  readonly nextOffset: number | null
}

const FACET_ANSWERS_PAGE_SIZE = 30

export const facetAnswersPage = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), facetId: z.string(), offset: z.number().int().min(0).optional() }))
  .handler(async ({ data, context }): Promise<FacetAnswersPageRecord> => {
    const orgId = await resolveOrgScope(context)
    const facetId = FacetId(data.facetId)
    const projectId = ProjectId(data.projectId)
    const offset = data.offset ?? 0

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        const projections = yield* repo.listRecentByFacet({
          organizationId: orgId,
          projectId,
          facetId,
          limit: FACET_ANSWERS_PAGE_SIZE,
          offset,
        })
        return {
          items: projections.map((projection) => ({
            sessionId: projection.sessionId as string,
            text: projection.extractedText,
          })),
          nextOffset: projections.length === FACET_ANSWERS_PAGE_SIZE ? offset + projections.length : null,
        }
      }).pipe(withScopedClickHouse(FacetProjectionRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/** A facet the project has defined, used to detect existing presets and prefill the refine form. */
export interface FacetRecord {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly instructions: string
}

const toFacetRecord = (facet: TaxonomyFacet): FacetRecord => ({
  id: facet.id,
  slug: facet.slug,
  name: facet.name,
  description: facet.description,
  instructions: facet.instructions,
})

export const listFacets = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data, context }): Promise<readonly FacetRecord[]> => {
    const orgId = await resolveOrgScope(context)

    const facets = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* FacetRepository
        return yield* repo.listByProject({ projectId: ProjectId(data.projectId) })
      }).pipe(withScopedPostgres(FacetRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return facets.map(toFacetRecord)
  })

/**
 * Create a behavior (from a preset or an inline custom definition) and materialize
 * it as its whole-project view: a custom behavior with an empty filter that gardens
 * over every session. Returns that view so the UI can navigate to its tree.
 */
const runCreateFacetBehavior = async (
  context: Parameters<typeof resolveOrgScope>[0],
  projectId: string,
  facetSelection: FacetSelection,
): Promise<CustomBehaviorRecord> => {
  const orgId = await resolveOrgScope(context)
  const publisher = await getQueuePublisher()

  const created = await Effect.runPromise(
    createFacetBehavior({ projectId: ProjectId(projectId), facetSelection }).pipe(
      Effect.provideService(QueuePublisher, publisher),
      withScopedPostgres(Layer.mergeAll(CustomBehaviorRepositoryLive, FacetRepositoryLive), getPostgresClient(), orgId),
      withTracing,
    ),
  )
  return toCustomBehaviorRecord(created)
}

export const createFacetBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      facetSelection: facetSelectionSchema,
    }),
  )
  .handler(
    ({ data, context }): Promise<CustomBehaviorRecord> =>
      runCreateFacetBehavior(context, data.projectId, data.facetSelection),
  )

/**
 * Create a behavior from author-supplied fields. The validator is flat, mirroring the
 * authoring form one-to-one, so a rejected field comes back with a Zod path the form
 * can put under the field that caused it — nesting it under `facetSelection.newFacet`
 * would leave the error with nowhere to land but a toast.
 */
export const createAuthoredBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(newFacetInputSchema.extend({ projectId: z.string() }))
  .handler(
    ({ data, context }): Promise<CustomBehaviorRecord> =>
      runCreateFacetBehavior(context, data.projectId, {
        kind: "newFacet",
        newFacet: { name: data.name, description: data.description, instructions: data.instructions },
      }),
  )

// Stop the in-flight garden then tear the behavior down (facet-scoped CH purge +
// Postgres facet/view). Shared by Stop and the instructions branch of Refine.
const terminateAndDiscard = async (orgId: ScopedOrgId, customBehaviorId: CustomBehaviorId, reason: string) => {
  const terminator = await getWorkflowTerminator()
  await Effect.runPromise(
    discardBehavior({ customBehaviorId, reason }).pipe(
      Effect.provideService(WorkflowTerminator, terminator),
      withScopedPostgres(
        Layer.mergeAll(CustomBehaviorRepositoryLive, FacetRepositoryLive, TaxonomyClusterRepositoryLive),
        getPostgresClient(),
        orgId,
      ),
      withScopedClickHouse(
        Layer.mergeAll(FacetProjectionRepositoryLive, TaxonomyViewAssignmentRepositoryLive),
        getClickhouseClient(),
        orgId,
      ),
      withTracing,
    ),
  )
}

/** Stop a running behavior garden and discard the behavior (destructive). */
export const stopBehaviorFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ customBehaviorId: z.string() }))
  .handler(async ({ data, context }): Promise<void> => {
    const orgId = await resolveOrgScope(context)
    await terminateAndDiscard(orgId, CustomBehaviorId(data.customBehaviorId), "behavior stopped by user")
  })

/**
 * Refine a behavior's instructions: stop the current garden, discard the old
 * behavior (facet-scoped purge), and create a fresh one with the edited
 * instructions. Because instructions are immutable, this is a new behavior.
 * Returns the new view.
 */
export const refineBehaviorFn = createServerFn({ method: "POST" })
  // Flat like `createAuthoredBehaviorFn`, and for the same reason: the refine form is
  // the same three fields, so its rejections need paths the form can place.
  .inputValidator(newFacetInputSchema.extend({ projectId: z.string(), customBehaviorId: z.string() }))
  .handler(async ({ data, context }): Promise<CustomBehaviorRecord> => {
    const orgId = await resolveOrgScope(context)
    await terminateAndDiscard(orgId, CustomBehaviorId(data.customBehaviorId), "behavior refined by user")
    const publisher = await getQueuePublisher()
    const created = await Effect.runPromise(
      createFacetBehavior({
        projectId: ProjectId(data.projectId),
        facetSelection: {
          kind: "newFacet",
          newFacet: { name: data.name, description: data.description, instructions: data.instructions },
        },
      }).pipe(
        Effect.provideService(QueuePublisher, publisher),
        withScopedPostgres(
          Layer.mergeAll(CustomBehaviorRepositoryLive, FacetRepositoryLive),
          getPostgresClient(),
          orgId,
        ),
        withTracing,
      ),
    )
    return toCustomBehaviorRecord(created)
  })
