import { AlertIncidentRepository } from "@domain/alerts"
import { ProjectRepository } from "@domain/projects"
import { cuidSchema, OrganizationId, ProjectId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { AlertIncidentRepositoryLive, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  INCIDENT_KINDS,
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
  // Hono's query parser returns a string when a key appears once and an array
  // when it's repeated; preprocess so a lone `?sourceTypes=issue` still parses
  // as a single-element array against the Zod schema. Applied to every list-
  // valued query param below.
  sourceTypes: z
    .preprocess(
      (val) => (val === undefined || Array.isArray(val) ? val : [val]),
      z.array(z.enum(INCIDENT_SOURCE_TYPES)),
    )
    .optional()
    .describe("Restrict to incidents whose source type matches any value in this list."),
  sourceId: cuidSchema.optional().describe("Restrict to incidents tied to a single source entity (e.g. one issue id)."),
  kinds: z
    .preprocess((val) => (val === undefined || Array.isArray(val) ? val : [val]), z.array(z.enum(INCIDENT_KINDS)))
    .optional()
    .describe("Restrict to incidents whose kind matches any value in this list."),
  severities: z
    .preprocess((val) => (val === undefined || Array.isArray(val) ? val : [val]), z.array(z.enum(INCIDENT_SEVERITIES)))
    .optional()
    .describe("Restrict to incidents whose severity matches any value in this list."),
})

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

    const incidents = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const incidentRepo = yield* AlertIncidentRepository
        return yield* incidentRepo.listByProjectId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          ...(query.sourceTypes && query.sourceTypes.length > 0 ? { sourceTypes: query.sourceTypes } : {}),
          ...(query.sourceId ? { sourceId: query.sourceId } : {}),
          ...(query.kinds && query.kinds.length > 0 ? { kinds: query.kinds } : {}),
          ...(query.severities && query.severities.length > 0 ? { severities: query.severities } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, AlertIncidentRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json({ items: incidents.map(toIncidentResponse) }, 200)
  },
})

export const createIncidentsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  listIncidents.mountHttp(app, createTierRateLimiter("low"))
  return app
}
