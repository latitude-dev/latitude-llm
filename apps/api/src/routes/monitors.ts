import {
  createMonitorAlertUseCase,
  createMonitorUseCase,
  deleteMonitorAlertUseCase,
  deleteMonitorUseCase,
  getMonitorBySlugUseCase,
  getMonitorIncidentsUseCase,
  listMonitorsUseCase,
  type MonitorAlertInput,
  MonitorAlertNotFoundError,
  muteMonitorUseCase,
  unmuteMonitorUseCase,
  updateMonitorAlertUseCase,
  updateMonitorUseCase,
} from "@domain/monitors"
import { ProjectRepository } from "@domain/projects"
import { AlertIncidentId, BadRequestError, MonitorAlertId, OrganizationId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  AlertIncidentRepositoryLive,
  MonitorRepositoryLive,
  NotificationRepositoryLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  type AlertIncidentCondition,
  CreateMonitorAlertBodySchema,
  decodeMonitorCursor,
  decodeMonitorIncidentCursor,
  encodeMonitorCursor,
  encodeMonitorIncidentCursor,
  MonitorAlertSchema,
  MonitorIncidentSchema,
  MonitorSchema,
  toMonitorAlertResponse,
  toMonitorIncidentResponse,
  toMonitorResponse,
  UpdateMonitorAlertBodySchema,
} from "../openapi/entities/monitor.ts"
import { Paginated } from "../openapi/pagination.ts"
import {
  jsonBody,
  openApiNoContentResponses,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const NAME_MAX_LENGTH = 128
const DESCRIPTION_MAX_LENGTH = 2000

const monitorsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "monitors",
    "x-fern-sdk-method-name": methodName,
  }) as const

const MonitorSlugParamsSchema = ProjectParamsSchema.extend({
  monitorSlug: z.string().describe("Monitor slug (human-readable identifier within the project)."),
})

const MonitorAlertParamsSchema = MonitorSlugParamsSchema.extend({
  alertId: z.string().describe("Monitor-alert identifier."),
})

const CreateMonitorBodySchema = z
  .object({
    name: z.string().min(1).max(NAME_MAX_LENGTH).describe("Human-readable name. Used to derive the slug."),
    description: z.string().max(DESCRIPTION_MAX_LENGTH).optional().describe("Optional free-form description."),
    alerts: z.array(CreateMonitorAlertBodySchema).min(1).describe("The monitor's alerts. At least one."),
  })
  .openapi("CreateMonitorBody")

const UpdateMonitorBodySchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(NAME_MAX_LENGTH)
      .optional()
      .describe("New name. Renaming may regenerate the slug — re-read the response or rely on `id`."),
    description: z.string().max(DESCRIPTION_MAX_LENGTH).optional().describe("New description."),
  })
  .openapi("UpdateMonitorBody")

const ListMonitorsQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe("Page size. Defaults to 50; max 100."),
  search: z.string().optional().describe("Filter by name (case-insensitive substring)."),
})

const ListMonitorIncidentsQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe("Page size. Defaults to 50; max 100."),
})

const PaginatedMonitorsSchema = Paginated(MonitorSchema, "PaginatedMonitors")
const PaginatedMonitorIncidentsSchema = Paginated(MonitorIncidentSchema, "PaginatedMonitorIncidents")
const MonitorAlertListSchema = z
  .object({ items: z.array(MonitorAlertSchema).describe("The monitor's alerts.") })
  .openapi("MonitorAlertList")

/** The validated alert body is structurally identical to the domain input; the condition is cast back to its branded union. */
const toMonitorAlertInput = (body: z.infer<typeof CreateMonitorAlertBodySchema>): MonitorAlertInput => ({
  kind: body.kind,
  source: { type: body.source.type, id: body.source.id },
  condition: (body.condition ?? null) as AlertIncidentCondition | null,
  ...(body.severity !== undefined ? { severity: body.severity } : {}),
})

export const monitorsPath = "/projects/:projectSlug/monitors"

const monitorEndpoint = defineApiEndpoint<OrganizationScopedEnv>(monitorsPath)

const listMonitors = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listMonitors",
    tags: ["Monitors"],
    ...monitorsFernGroup("list"),
    summary: "List monitors",
    description: "Returns the project's monitors, system monitors first, then by most recent activity.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListMonitorsQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedMonitorsSchema, description: "Page of monitors" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        let offset = 0
        if (query.cursor) {
          const decoded = decodeMonitorCursor(query.cursor)
          if (!decoded) return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          offset = decoded.offset
        }
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* listMonitorsUseCase({
          projectId: project.id,
          limit: query.limit,
          offset,
          ...(query.search ? { searchQuery: query.search } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    const nextCursor = result.hasMore ? encodeMonitorCursor(result.offset + result.items.length) : null
    return c.json({ items: result.items.map(toMonitorResponse), nextCursor, hasMore: result.hasMore }, 200)
  },
})

const createMonitor = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createMonitor",
    tags: ["Monitors"],
    ...monitorsFernGroup("create"),
    summary: "Create monitor",
    description: "Creates a monitor with one or more saved-search alerts. The slug is derived from `name`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateMonitorBodySchema) },
    responses: openApiResponses({ status: 201, schema: MonitorSchema, description: "Monitor created" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* createMonitorUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: project.id,
          name: body.name,
          ...(body.description !== undefined ? { description: body.description } : {}),
          alerts: body.alerts.map(toMonitorAlertInput),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorResponse(monitor), 201)
  },
})

const getMonitor = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/{monitorSlug}",
    name: "getMonitor",
    tags: ["Monitors"],
    ...monitorsFernGroup("get"),
    summary: "Get monitor",
    description: "Returns a single monitor by slug.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: MonitorSchema, description: "Monitor" }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorResponse(monitor), 200)
  },
})

const updateMonitor = monitorEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{monitorSlug}",
    name: "updateMonitor",
    tags: ["Monitors"],
    ...monitorsFernGroup("update"),
    summary: "Update monitor",
    description: "Updates a monitor's name and description. System monitors cannot be edited.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema, body: jsonBody(UpdateMonitorBodySchema) },
    responses: openApiResponses({
      status: 200,
      schema: MonitorSchema,
      description: "Updated monitor",
      extraErrors: { 403: { description: "System monitors cannot be edited" } },
    }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        return yield* updateMonitorUseCase({
          id: current.id,
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorResponse(monitor), 200)
  },
})

const deleteMonitor = monitorEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{monitorSlug}",
    name: "deleteMonitor",
    tags: ["Monitors"],
    ...monitorsFernGroup("delete"),
    summary: "Delete monitor",
    description: "Deletes a monitor and its alerts. System monitors cannot be deleted.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiNoContentResponses({ description: "Monitor deleted" }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        yield* deleteMonitorUseCase({ id: current.id })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.body(null, 204)
  },
})

const listMonitorAlerts = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/{monitorSlug}/alerts",
    name: "listMonitorAlerts",
    tags: ["Monitors"],
    ...monitorsFernGroup("listAlerts"),
    summary: "List monitor alerts",
    description: "Returns the monitor's alerts.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: MonitorAlertListSchema, description: "The monitor's alerts" }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json({ items: monitor.alerts.map(toMonitorAlertResponse) }, 200)
  },
})

const getMonitorAlert = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/{monitorSlug}/alerts/{alertId}",
    name: "getMonitorAlert",
    tags: ["Monitors"],
    ...monitorsFernGroup("getAlert"),
    summary: "Get monitor alert",
    description: "Returns a single monitor alert by id.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorAlertParamsSchema },
    responses: openApiResponses({ status: 200, schema: MonitorAlertSchema, description: "Monitor alert" }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug, alertId } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const alert = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const monitor = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        const found = monitor.alerts.find((candidate) => candidate.id === alertId)
        if (!found) return yield* new MonitorAlertNotFoundError({ monitorId: monitor.id, alertId })
        return found
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorAlertResponse(alert), 200)
  },
})

const createMonitorAlert = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/{monitorSlug}/alerts",
    name: "createMonitorAlert",
    tags: ["Monitors"],
    ...monitorsFernGroup("createAlert"),
    summary: "Create monitor alert",
    description:
      "Adds a saved-search alert to a monitor and returns the updated monitor. System monitors cannot gain alerts.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema, body: jsonBody(CreateMonitorAlertBodySchema) },
    responses: openApiResponses({
      status: 201,
      schema: MonitorSchema,
      description: "Monitor with the new alert",
      extraErrors: { 403: { description: "System monitors cannot gain alerts" } },
    }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        return yield* createMonitorAlertUseCase({ monitorId: current.id, ...toMonitorAlertInput(body) })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorResponse(monitor), 201)
  },
})

const updateMonitorAlert = monitorEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{monitorSlug}/alerts/{alertId}",
    name: "updateMonitorAlert",
    tags: ["Monitors"],
    ...monitorsFernGroup("updateAlert"),
    summary: "Update monitor alert",
    description:
      "Updates an alert and returns the updated monitor. On system monitors only the condition may change; on your own monitors any field may.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorAlertParamsSchema, body: jsonBody(UpdateMonitorAlertBodySchema) },
    responses: openApiResponses({
      status: 200,
      schema: MonitorSchema,
      description: "Monitor with the updated alert",
      extraErrors: { 403: { description: "Disallowed change on a system monitor" } },
    }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug, alertId } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        return yield* updateMonitorAlertUseCase({
          monitorId: current.id,
          alertId: MonitorAlertId(alertId),
          ...(body.kind !== undefined ? { kind: body.kind } : {}),
          ...(body.source !== undefined ? { source: { type: body.source.type, id: body.source.id } } : {}),
          ...(body.condition !== undefined ? { condition: body.condition as AlertIncidentCondition | null } : {}),
          ...(body.severity !== undefined ? { severity: body.severity } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorResponse(monitor), 200)
  },
})

const deleteMonitorAlert = monitorEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{monitorSlug}/alerts/{alertId}",
    name: "deleteMonitorAlert",
    tags: ["Monitors"],
    ...monitorsFernGroup("deleteAlert"),
    summary: "Delete monitor alert",
    description:
      "Removes an alert from a monitor. A monitor must keep at least one alert; system monitors' alerts cannot be removed.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorAlertParamsSchema },
    responses: openApiNoContentResponses({ description: "Alert deleted" }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug, alertId } = c.req.valid("param")
    const organizationId = c.var.organization.id

    await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        yield* deleteMonitorAlertUseCase({ monitorId: current.id, alertId: MonitorAlertId(alertId) })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.body(null, 204)
  },
})

const listMonitorIncidents = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/{monitorSlug}/incidents",
    name: "listMonitorIncidents",
    tags: ["Monitors"],
    ...monitorsFernGroup("listIncidents"),
    summary: "List monitor incidents",
    description:
      "Returns the incidents opened by a monitor, most recent first. Each item's `notified` flag shows whether it triggered a notification.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema, query: ListMonitorIncidentsQuerySchema },
    responses: openApiResponses({
      status: 200,
      schema: PaginatedMonitorIncidentsSchema,
      description: "Page of incidents",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        let cursor: { endedAt: Date | null; id: string } | undefined
        if (query.cursor) {
          const decoded = decodeMonitorIncidentCursor(query.cursor)
          if (!decoded) return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          cursor = decoded
        }
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const monitor = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        return yield* getMonitorIncidentsUseCase({
          organizationId: OrganizationId(organizationId as string),
          monitorId: monitor.id,
          limit: query.limit,
          ...(cursor ? { cursor: { endedAt: cursor.endedAt, id: AlertIncidentId(cursor.id) } } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            ProjectRepositoryLive,
            MonitorRepositoryLive,
            AlertIncidentRepositoryLive,
            NotificationRepositoryLive,
          ),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(
      {
        items: result.items.map(toMonitorIncidentResponse),
        nextCursor: result.nextCursor ? encodeMonitorIncidentCursor(result.nextCursor) : null,
        hasMore: result.hasMore,
      },
      200,
    )
  },
})

const muteMonitor = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/{monitorSlug}/mute",
    name: "muteMonitor",
    tags: ["Monitors"],
    ...monitorsFernGroup("mute"),
    summary: "Mute monitor",
    description: "Mutes a monitor so its incidents stop sending notifications. Allowed on all monitors.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: MonitorSchema, description: "Muted monitor" }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        return yield* muteMonitorUseCase({ id: current.id })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorResponse(monitor), 200)
  },
})

const unmuteMonitor = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/{monitorSlug}/unmute",
    name: "unmuteMonitor",
    tags: ["Monitors"],
    ...monitorsFernGroup("unmute"),
    summary: "Unmute monitor",
    description: "Lifts a monitor's mute so its incidents notify again.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: MonitorSchema, description: "Unmuted monitor" }),
  }),
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        return yield* unmuteMonitorUseCase({ id: current.id })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorResponse(monitor), 200)
  },
})

export const createMonitorsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  listMonitors.mountHttp(app, createTierRateLimiter("low"))
  createMonitor.mountHttp(app, createTierRateLimiter("medium"))
  getMonitor.mountHttp(app, createTierRateLimiter("low"))
  updateMonitor.mountHttp(app, createTierRateLimiter("medium"))
  deleteMonitor.mountHttp(app, createTierRateLimiter("medium"))
  listMonitorAlerts.mountHttp(app, createTierRateLimiter("low"))
  createMonitorAlert.mountHttp(app, createTierRateLimiter("medium"))
  getMonitorAlert.mountHttp(app, createTierRateLimiter("low"))
  updateMonitorAlert.mountHttp(app, createTierRateLimiter("medium"))
  deleteMonitorAlert.mountHttp(app, createTierRateLimiter("medium"))
  listMonitorIncidents.mountHttp(app, createTierRateLimiter("low"))
  muteMonitor.mountHttp(app, createTierRateLimiter("medium"))
  unmuteMonitor.mountHttp(app, createTierRateLimiter("medium"))
  return app
}
