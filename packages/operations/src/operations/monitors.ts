import {
  createMonitorUseCase,
  deleteMonitorUseCase,
  getMonitorBySlugUseCase,
  getMonitorIncidentsUseCase,
  listMonitorsForTargetUseCase,
  listMonitorsUseCase,
  muteMonitorUseCase,
  unmuteMonitorUseCase,
  updateMonitorUseCase,
} from "@domain/monitors"
import { ProjectRepository } from "@domain/projects"
import { AlertIncidentId, BadRequestError, OrganizationId } from "@domain/shared"
import { createRoute, z } from "@hono/zod-openapi"
import {
  IncidentRepositoryLive,
  MonitorRepositoryLive,
  NotificationRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  SavedSearchRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { AlertEscalatingConditionSchema, AlertThresholdConditionSchema } from "../openapi/entities/incident.ts"
import {
  decodeMonitorCursor,
  decodeMonitorIncidentCursor,
  encodeMonitorCursor,
  encodeMonitorIncidentCursor,
  MonitorIncidentSchema,
  MonitorMetricSchema,
  MonitorSchema,
  MonitorTargetSchema,
  toMonitorIncidentResponse,
  toMonitorResponse,
} from "../openapi/entities/monitor.ts"
import { Paginated } from "../openapi/pagination.ts"
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  openApiNoContentResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const NAME_MAX_LENGTH = 128
const DESCRIPTION_MAX_LENGTH = 2000

const MonitorSlugParamsSchema = ProjectParamsSchema.extend({
  monitorSlug: z.string().describe("Monitor slug (human-readable identifier within the project)."),
})

const CreateMonitorBaseBodySchema = z.object({
  name: z.string().min(1).max(NAME_MAX_LENGTH).describe("Human-readable name. Used to derive the slug."),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).optional().describe("Optional free-form description."),
  target: MonitorTargetSchema.describe("Entity or filter set watched by the monitor."),
  severity: z.enum(["low", "medium", "high"]).describe("Severity assigned to incidents opened by this monitor."),
})

const CreateMonitorBodySchema = z
  .discriminatedUnion("trigger", [
    CreateMonitorBaseBodySchema.extend({
      trigger: z.literal("match").describe("Opens a point incident when any matching event appears."),
      metric: MonitorMetricSchema.optional().describe(
        "Metric stored for later rule edits. Match monitors evaluate counts.",
      ),
    }).strict(),
    CreateMonitorBaseBodySchema.extend({
      trigger: z.literal("threshold").describe("Opens a point incident when the condition is met."),
      metric: MonitorMetricSchema.optional().describe("Metric evaluated by the monitor rule."),
      condition: AlertThresholdConditionSchema.describe("Threshold condition that opens point incidents."),
    }),
    CreateMonitorBaseBodySchema.extend({
      trigger: z.literal("escalating").describe("Opens and closes a sustained incident while the condition is met."),
      metric: MonitorMetricSchema.optional().describe("Metric evaluated by the monitor rule."),
      condition: AlertEscalatingConditionSchema.describe("Escalating condition that opens sustained incidents."),
    }),
  ])
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
    severity: z.enum(["low", "medium", "high"]).optional().describe("Replacement incident severity."),
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

const ListMonitorsForTargetBodySchema = z
  .object({
    targetType: MonitorTargetSchema.shape.type.optional().describe("Optional target type to match."),
    filterSetContains: MonitorTargetSchema.shape.filterSet
      .unwrap()
      .describe(
        "Filter subset to match against monitor targets. For one user use `userId`; for one tool use `operation = execute_tool` and `toolName`.",
      ),
  })
  .openapi("ListMonitorsForTargetBody")

const PaginatedMonitorsSchema = Paginated(MonitorSchema, "PaginatedMonitors")
const PaginatedMonitorIncidentsSchema = Paginated(MonitorIncidentSchema, "PaginatedMonitorIncidents")

const MonitorListSchema = z
  .object({ items: z.array(MonitorSchema).describe("Matching monitors.") })
  .openapi("MonitorList")

const monitorsPath = "/projects/:projectSlug/monitors"

const monitorEndpoint = defineOperation<OrganizationScopedEnv>(monitorsPath)

const listMonitors = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listMonitors",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "list",
    summary: "List monitors",
    description: "Returns the project's monitors, system monitors first, then by most recent activity.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListMonitorsQuerySchema },
    responses: typedResponses({ status: 200, schema: PaginatedMonitorsSchema, description: "Page of monitors" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const query = input.query

      let offset = 0
      if (query.cursor) {
        const decoded = decodeMonitorCursor(query.cursor)
        if (!decoded) return yield* new BadRequestError({ message: "Invalid `cursor` value." })
        offset = decoded.offset
      }
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const result = yield* listMonitorsUseCase({
        projectId: project.id,
        limit: query.limit,
        offset,
        ...(query.search ? { searchQuery: query.search } : {}),
      })
      const nextCursor = result.hasMore ? encodeMonitorCursor(result.offset + result.items.length) : null
      return {
        status: 200,
        body: { items: result.items.map(toMonitorResponse), nextCursor, hasMore: result.hasMore },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(
          ProjectRepositoryLive,
          MonitorRepositoryLive,
          SavedSearchRepositoryLive,
          IncidentRepositoryLive,
          OutboxEventWriterLive,
        ),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const createMonitor = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createMonitor",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "create",
    summary: "Create monitor",
    description: "Creates a monitor with one rule. The slug is derived from `name`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateMonitorBodySchema) },
    responses: typedResponses({ status: 201, schema: MonitorSchema, description: "Monitor created" }),
  }),
  access: "write",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const body = input.body
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const monitor = yield* createMonitorUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: project.id,
        name: body.name,
        ...(body.description !== undefined ? { description: body.description } : {}),
        target: body.target,
        rule: {
          trigger: body.trigger,
          severity: body.severity,
          config: {
            ...(body.metric !== undefined ? { metric: body.metric } : {}),
            ...("condition" in body ? { condition: body.condition } : {}),
          },
        },
      })
      return { status: 201, body: toMonitorResponse(monitor) } as const
    }).pipe(
      withPostgres(
        // SavedSearchRepository backs the semantic-search monitorability check on the watched search.
        Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive, SavedSearchRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const listMonitorsForTarget = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/for-target",
    name: "listMonitorsForTarget",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "listForTarget",
    summary: "List monitors for target",
    description: "Returns live monitors matching the supplied target type and/or filter subset.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(ListMonitorsForTargetBodySchema) },
    responses: typedResponses({ status: 200, schema: MonitorListSchema, description: "Matching monitors" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const body = input.body
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const monitors = yield* listMonitorsForTargetUseCase({
        projectId: project.id,
        ...(body.targetType !== undefined ? { targetType: body.targetType } : {}),
        filterSetContains: body.filterSetContains,
      })
      return { status: 200, body: { items: monitors.map(toMonitorResponse) } } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const getMonitor = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/{monitorSlug}",
    name: "getMonitor",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "get",
    summary: "Get monitor",
    description: "Returns a single monitor by slug.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: typedResponses({ status: 200, schema: MonitorSchema, description: "Monitor" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, monitorSlug } = input.params
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const monitor = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
      return { status: 200, body: toMonitorResponse(monitor) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const updateMonitor = monitorEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{monitorSlug}",
    name: "updateMonitor",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "update",
    summary: "Update monitor",
    description:
      "Updates a monitor's metadata and incident severity. Target, trigger, metric, and conditions are fixed after creation. System monitor edits are restricted.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema, body: jsonBody(UpdateMonitorBodySchema) },
    responses: {
      200: jsonResponse(MonitorSchema, "Updated monitor"),
      400: errorResponse("Validation error"),
      401: errorResponse("Unauthorized"),
      404: errorResponse("Not found"),
      403: errorResponse("System monitors cannot be edited"),
    },
  }),
  access: "destructive",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, monitorSlug } = input.params
      const body = input.body
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
      const rule =
        body.severity !== undefined
          ? {
              trigger: current.rule.trigger,
              severity: body.severity,
              config: current.rule.config,
            }
          : undefined
      const monitor = yield* updateMonitorUseCase({
        id: current.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(rule !== undefined ? { rule } : {}),
      })
      return { status: 200, body: toMonitorResponse(monitor) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(
          ProjectRepositoryLive,
          MonitorRepositoryLive,
          SavedSearchRepositoryLive,
          IncidentRepositoryLive,
          OutboxEventWriterLive,
        ),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const deleteMonitor = monitorEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{monitorSlug}",
    name: "deleteMonitor",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "delete",
    summary: "Delete monitor",
    description: "Deletes a monitor. System monitors cannot be deleted.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiNoContentResponses({ description: "Monitor deleted" }),
  }),
  access: "destructive",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, monitorSlug } = input.params
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
      yield* deleteMonitorUseCase({ id: current.id })
      return { status: 204 } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive, IncidentRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const listMonitorIncidents = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/{monitorSlug}/incidents",
    name: "listMonitorIncidents",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "listIncidents",
    summary: "List monitor incidents",
    description:
      "Returns the incidents opened by a monitor, most recent first. Each item's `notified` flag shows whether it triggered a notification.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema, query: ListMonitorIncidentsQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: PaginatedMonitorIncidentsSchema,
      description: "Page of incidents",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, monitorSlug } = input.params
      const query = input.query

      let cursor: { endedAt: Date | null; id: string } | undefined
      if (query.cursor) {
        const decoded = decodeMonitorIncidentCursor(query.cursor)
        if (!decoded) return yield* new BadRequestError({ message: "Invalid `cursor` value." })
        cursor = decoded
      }
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const monitor = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
      const result = yield* getMonitorIncidentsUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        monitorId: monitor.id,
        limit: query.limit,
        ...(cursor ? { cursor: { endedAt: cursor.endedAt, id: AlertIncidentId(cursor.id) } } : {}),
      })
      return {
        status: 200,
        body: {
          items: result.items.map(toMonitorIncidentResponse),
          nextCursor: result.nextCursor ? encodeMonitorIncidentCursor(result.nextCursor) : null,
          hasMore: result.hasMore,
        },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(
          ProjectRepositoryLive,
          MonitorRepositoryLive,
          IncidentRepositoryLive,
          NotificationRepositoryLive,
        ),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const muteMonitor = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/{monitorSlug}/mute",
    name: "muteMonitor",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "mute",
    summary: "Mute monitor",
    description: "Mutes a monitor so its incidents stop sending notifications. Allowed on all monitors.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: typedResponses({ status: 200, schema: MonitorSchema, description: "Muted monitor" }),
  }),
  access: "write",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, monitorSlug } = input.params
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
      const monitor = yield* muteMonitorUseCase({ id: current.id })
      return { status: 200, body: toMonitorResponse(monitor) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const unmuteMonitor = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/{monitorSlug}/unmute",
    name: "unmuteMonitor",
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "unmute",
    summary: "Unmute monitor",
    description: "Lifts a monitor's mute so its incidents notify again.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: typedResponses({ status: 200, schema: MonitorSchema, description: "Unmuted monitor" }),
  }),
  access: "write",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, monitorSlug } = input.params
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
      const monitor = yield* unmuteMonitorUseCase({ id: current.id })
      return { status: 200, body: toMonitorResponse(monitor) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

export const monitorsModule: OperationModule = {
  path: monitorsPath,
  operations: [
    listMonitors,
    createMonitor,
    listMonitorsForTarget,
    getMonitor,
    updateMonitor,
    deleteMonitor,
    listMonitorIncidents,
    muteMonitor,
    unmuteMonitor,
  ],
}
