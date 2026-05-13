import {
  BadRequestError,
  type ChSqlClient,
  filterSetSchema,
  NotFoundError,
  OrganizationId,
  type ProjectId,
  type RepositoryError,
  TraceId,
  traceIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { type TraceListCursor, TraceRepository } from "../ports/trace-repository.ts"

/**
 * Discriminated union identifying a target trace for public-API write paths.
 *
 * - `{ by: "id", id }` — exact trace id lookup. Verified scoped to the project
 *   before being trusted (so callers can't write against a trace they don't
 *   own by guessing the id).
 * - `{ by: "filters", filters }` — resolve a single trace from a `FilterSet`
 *   by attribute or metadata. Exactly one match required.
 *
 * The filter path exists for callers (including our own SDKs) that don't have
 * the raw OpenTelemetry trace id at hand but can identify the trace via
 * attributes such as `attributes.scoreId` or `metadata.userId`.
 */
export const traceRefSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("id"), id: traceIdSchema }),
  z.object({ by: z.literal("filters"), filters: filterSetSchema }),
])

export type TraceRef = z.infer<typeof traceRefSchema>

/** Resolve a `TraceRef` to a concrete `TraceId` scoped to organization + project. */
export const resolveTraceIdFromRef = (
  trace: TraceRef,
  ctx: { readonly organizationId: string; readonly projectId: ProjectId },
): Effect.Effect<TraceId, BadRequestError | NotFoundError | RepositoryError, TraceRepository | ChSqlClient> =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository
    const organizationId = OrganizationId(ctx.organizationId)

    if (trace.by === "id") {
      // Verify the trace exists within this organization + project before
      // trusting the caller-supplied id. Without this, a caller could write
      // against any traceId — including one owned by a different tenant.
      // `matchesFiltersByTraceId` with no filters is a cheap scoped existence
      // check (one count query).
      const traceId = TraceId(trace.id)
      const belongsToProject = yield* traceRepository.matchesFiltersByTraceId({
        organizationId,
        projectId: ctx.projectId,
        traceId,
      })
      if (!belongsToProject) {
        return yield* new NotFoundError({ entity: "Trace", id: trace.id })
      }
      return traceId
    }

    const page = yield* traceRepository.listByProjectId({
      organizationId,
      projectId: ctx.projectId,
      options: { filters: trace.filters, limit: 2 },
    })

    if (page.items.length > 1) {
      return yield* new BadRequestError({
        message:
          "Trace filter matched more than one trace in this project. Refine the filter set so it identifies exactly one trace.",
      })
    }

    const [match] = page.items
    if (match === undefined) {
      return yield* new NotFoundError({
        entity: "Trace",
        id: "No trace in this project matches the provided filters",
      })
    }

    return match.traceId
  })

/**
 * Plural sibling of {@link traceRefSchema} for bulk endpoints (export traces,
 * import-from-traces into a dataset, etc).
 *
 * - `{ by: "ids", ids }` — explicit list of trace ids. Each id is verified
 *   against the project before being trusted; ids that don't belong to the
 *   project are silently dropped (the caller learns about it via the returned
 *   count, not via an error).
 * - `{ by: "filters", filters }` — resolves to **every** trace in the project
 *   matching the filter set. Pagination happens internally; no upper bound is
 *   enforced at this layer (callers/UIs may impose their own).
 */
export const tracesRefSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("ids"), ids: z.array(traceIdSchema).min(1) }),
  z.object({ by: z.literal("filters"), filters: filterSetSchema }),
])

export type TracesRef = z.infer<typeof tracesRefSchema>

const RESOLVE_PAGE_SIZE = 1000

/**
 * Resolve a {@link TracesRef} to the concrete list of `TraceId`s in this
 * organization + project.
 *
 * For the `ids` variant we round-trip through `listByTraceIds` which already
 * filters by `(organizationId, projectId)` server-side, so any id the caller
 * doesn't own is dropped from the result.
 *
 * For the `filters` variant we walk every page until the cursor is exhausted.
 * No hard cap is applied here — bulk endpoints that consume the result are
 * expected to either accept large fan-outs (export → email) or impose their
 * own limit before invoking this function.
 */
export const resolveTraceIdsFromRef = (
  ref: TracesRef,
  ctx: { readonly organizationId: string; readonly projectId: ProjectId },
): Effect.Effect<readonly TraceId[], RepositoryError, TraceRepository | ChSqlClient> =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository
    const organizationId = OrganizationId(ctx.organizationId)

    if (ref.by === "ids") {
      const found = yield* traceRepository.listByTraceIds({
        organizationId,
        projectId: ctx.projectId,
        traceIds: ref.ids,
      })
      return found.map((trace) => trace.traceId)
    }

    const ids: TraceId[] = []
    let cursor: TraceListCursor | undefined
    while (true) {
      const page = yield* traceRepository.listByProjectId({
        organizationId,
        projectId: ctx.projectId,
        options: {
          filters: ref.filters,
          limit: RESOLVE_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
      })
      for (const trace of page.items) ids.push(trace.traceId)
      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
    }
    return ids
  })
