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
import { TraceRepository } from "../ports/trace-repository.ts"

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
