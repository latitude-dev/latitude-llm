import { IncidentRepository, resolveIncidentUseCase } from "@domain/incidents"
import { ProjectRepository } from "@domain/projects"
import { AlertIncidentId, cuidSchema, NotFoundError, OrganizationId, ProjectId } from "@domain/shared"
import { createRoute, z } from "@hono/zod-openapi"
import {
  IncidentRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import {
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCE_TYPES,
  IncidentSchema,
  toIncidentResponse,
} from "../openapi/entities/incident.ts"
import { PROTECTED_SECURITY, ProjectParamsSchema, typedResponses } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

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

const incidentsPath = "/projects/:projectSlug/incidents"

const incidentEndpoint = defineOperation<OrganizationScopedEnv>(incidentsPath)

const listIncidents = incidentEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listIncidents",
    tags: ["Incidents"],
    group: "incidents",
    sdkMethod: "list",
    summary: "List project incidents",
    description:
      "Returns incidents in the project, ordered from oldest to newest. The time window defaults to the trailing 7 days.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListIncidentsQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: ListIncidentsResponseSchema,
      description: "Matching incidents",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const query = input.query
      const { from, to } = resolveIncidentsRange(query.fromIso, query.toIso, new Date())
      const sourceTypes = query.source_type ? [query.source_type] : undefined

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const incidentRepo = yield* IncidentRepository
      const incidents = yield* incidentRepo.listByProjectId({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        from,
        to,
        ...(sourceTypes && sourceTypes.length > 0 ? { sourceTypes } : {}),
        ...(query.source_id ? { sourceId: query.source_id } : {}),
        ...(query.severities && query.severities.length > 0 ? { severities: query.severities } : {}),
      })
      return { status: 200, body: { items: incidents.map(toIncidentResponse) } } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, IncidentRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
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
    group: "incidents",
    sdkMethod: "resolve",
    summary: "Resolve incident",
    description:
      "Resolves (closes) an ongoing incident. An already-closed incident is returned unchanged. If the incident's condition triggers again, a new incident will be opened.",
    security: PROTECTED_SECURITY,
    request: { params: IncidentParamsSchema },
    responses: typedResponses({ status: 200, schema: IncidentSchema, description: "Resolved incident" }),
  }),
  access: "write",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, incidentId } = input.params

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

      const incident = yield* resolveIncidentUseCase({ id: current.id, endedAt: new Date() })
      return { status: 200, body: toIncidentResponse(incident) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, IncidentRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

export const incidentsModule: OperationModule = {
  path: incidentsPath,
  operations: [listIncidents, resolveIncident],
}
