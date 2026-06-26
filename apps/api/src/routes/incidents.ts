import { IncidentRepository, resolveIncidentUseCase } from "@domain/incidents"
import { ProjectRepository } from "@domain/projects"
import { AlertIncidentId, BadRequestError, cuidSchema, NotFoundError, OrganizationId, ProjectId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  IncidentRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCE_TYPES,
  IncidentSchema,
  toIncidentResponse,
} from "../openapi/entities/incident.ts"
import { openApiResponses, PROTECTED_SECURITY, ProjectParamsSchema } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const incidentsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "incidents",
    "x-fern-sdk-method-name": methodName,
  }) as const

const DEFAULT_RANGE_DAYS = 7
const DEFAULT_RANGE_MS = DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000
const IncidentSourceTypeQuerySchema = z.enum(INCIDENT_SOURCE_TYPES)

const resolveIncidentsRange = (
  fromIso: string | undefined,
  toIso: string | undefined,
  now: Date,
): { readonly from: Date; readonly to: Date } => {
  if (fromIso && toIso) return { from: new Date(fromIso), to: new Date(toIso) }
  if (fromIso) return { from: new Date(fromIso), to: now }
  if (toIso) {
    const to = new Date(toIso)
    return { from: new Date(to.getTime() - DEFAULT_RANGE_MS), to }
  }
  return { from: new Date(now.getTime() - DEFAULT_RANGE_MS), to: now }
}

const ListIncidentsQuerySchema = z.object({
  fromIso: z.iso
    .datetime()
    .optional()
    .describe(
      "Lower bound (inclusive) of the time window. Returns incidents whose lifetime overlaps `[fromIso, toIso]`. Defaults to 7 days before `toIso`.",
    ),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive) of the time window. Defaults to now."),
  source_type: IncidentSourceTypeQuerySchema.optional().describe(
    "Restrict to incidents triggered by this source type: `monitor` or `signal`.",
  ),
  source_id: cuidSchema.optional().describe("Restrict to incidents tied to one source entity id."),
  sourceTypes: z
    .preprocess(
      (val) => (val === undefined || Array.isArray(val) ? val : [val]),
      z.array(IncidentSourceTypeQuerySchema),
    )
    .optional()
    .describe("Deprecated alias for `source_type`; prefer `source_type`."),
  kinds: z
    .preprocess((val) => (val === undefined || Array.isArray(val) ? val : [val]), z.array(z.string()))
    .optional()
    .describe("Deprecated filter from the previous incidents model. This endpoint now filters by source and severity."),
  severities: z
    .preprocess((val) => (val === undefined || Array.isArray(val) ? val : [val]), z.array(z.enum(INCIDENT_SEVERITIES)))
    .optional()
    .describe("Restrict to incidents whose severity matches any value in this list."),
})

type ListIncidentsQuery = z.infer<typeof ListIncidentsQuerySchema>

const parseLegacySourceType = (sourceType: string | undefined) => {
  if (sourceType === undefined) return undefined
  const parsed = IncidentSourceTypeQuerySchema.safeParse(sourceType)
  if (parsed.success) return parsed.data
  throw new BadRequestError({ message: "`sourceType` must be `monitor` or `signal`." })
}

const parseLegacySourceId = (sourceId: string | undefined) => {
  if (sourceId === undefined) return undefined
  const parsed = cuidSchema.safeParse(sourceId)
  if (parsed.success) return parsed.data
  throw new BadRequestError({ message: "`sourceId` must be a valid id." })
}

export const resolveListIncidentsFilters = (
  query: ListIncidentsQuery,
  legacyQuery: { readonly sourceType?: string | undefined; readonly sourceId?: string | undefined },
) => {
  if (query.kinds !== undefined) {
    throw new BadRequestError({ message: "`kinds` is no longer supported. Use `source_type` and `severities`." })
  }

  const legacySourceType = parseLegacySourceType(legacyQuery.sourceType)
  const legacySourceId = parseLegacySourceId(legacyQuery.sourceId)

  return {
    sourceTypes: query.source_type
      ? [query.source_type]
      : (query.sourceTypes ?? (legacySourceType ? [legacySourceType] : undefined)),
    sourceId: query.source_id ?? legacySourceId,
  }
}

const ListIncidentsResponseSchema = z
  .object({
    items: z.array(IncidentSchema).describe("Incidents matching the filters, ordered by `startedAt` ascending."),
  })
  .openapi("ListIncidentsResponse")

export const incidentsPath = "/projects/:projectSlug/incidents"

const incidentEndpoint = defineApiEndpoint<OrganizationScopedEnv>(incidentsPath)

const listIncidents = incidentEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listIncidents",
    tags: ["Incidents"],
    ...incidentsFernGroup("list"),
    summary: "List project incidents",
    description:
      "Returns incidents in the project, ordered from oldest to newest. The time window defaults to the trailing 7 days.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListIncidentsQuerySchema },
    responses: openApiResponses({
      status: 200,
      schema: ListIncidentsResponseSchema,
      description: "Matching incidents",
    }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id
    const { from, to } = resolveIncidentsRange(query.fromIso, query.toIso, new Date())
    const { sourceTypes, sourceId } = resolveListIncidentsFilters(query, {
      sourceType: c.req.query("sourceType"),
      sourceId: c.req.query("sourceId"),
    })

    const incidents = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const incidentRepo = yield* IncidentRepository
        return yield* incidentRepo.listByProjectId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          ...(sourceTypes && sourceTypes.length > 0 ? { sourceTypes } : {}),
          ...(sourceId ? { sourceId } : {}),
          ...(query.severities && query.severities.length > 0 ? { severities: query.severities } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, IncidentRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json({ items: incidents.map(toIncidentResponse) }, 200)
  },
})

const IncidentParamsSchema = ProjectParamsSchema.extend({
  incidentId: cuidSchema.describe("Incident identifier."),
})

const resolveIncident = incidentEndpoint({
  route: createRoute({
    method: "post",
    path: "/{incidentId}",
    name: "resolveIncident",
    tags: ["Incidents"],
    ...incidentsFernGroup("resolve"),
    summary: "Resolve incident",
    description:
      "Resolves (closes) an ongoing incident. An already-closed incident is returned unchanged. If the incident's condition triggers again, a new incident will be opened.",
    security: PROTECTED_SECURITY,
    request: { params: IncidentParamsSchema },
    responses: openApiResponses({ status: 200, schema: IncidentSchema, description: "Resolved incident" }),
  }),
  handler: async (c) => {
    const { projectSlug, incidentId } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const incident = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        // Re-tag lookup misses as `Incident` and 404 incidents outside the
        // project in the path, so callers can't probe other projects' ids.
        const incidentRepo = yield* IncidentRepository
        const current = yield* incidentRepo
          .findById(AlertIncidentId(incidentId))
          .pipe(
            Effect.catchTag("NotFoundError", () =>
              Effect.fail(new NotFoundError({ entity: "Incident", id: incidentId })),
            ),
          )
        if ((current.projectId as string) !== (project.id as string)) {
          return yield* new NotFoundError({ entity: "Incident", id: incidentId })
        }

        return yield* resolveIncidentUseCase({ id: current.id, endedAt: new Date() })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, IncidentRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toIncidentResponse(incident), 200)
  },
})

export const createIncidentsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  listIncidents.mountHttp(app, createTierRateLimiter("low"))
  resolveIncident.mountHttp(app, createTierRateLimiter("medium"))
  return app
}
