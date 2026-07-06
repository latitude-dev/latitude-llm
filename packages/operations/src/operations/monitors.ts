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
import {
  AlertConditionSchema,
  AlertEscalatingConditionSchema,
  AlertThresholdConditionSchema,
} from "../openapi/entities/incident.ts"
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
  jsonBody,
  openApiNoContentResponses,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const NAME_MAX_LENGTH = 128
const DESCRIPTION_MAX_LENGTH = 2000

const MonitorSlugParamsSchema = ProjectParamsSchema.extend({
  monitorSlug: z.string().describe("Monitor slug (human-readable identifier within the project)."),
})

const streamForTargetType = (type: z.infer<typeof MonitorTargetSchema>["type"]) =>
  type === "tool" ? ("spans" as const) : type === "session" ? ("sessions" as const) : ("traces" as const)

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
    target: MonitorTargetSchema.optional().describe("Replacement target watched by the monitor."),
    trigger: z
      .enum(["match", "threshold", "escalating"])
      .optional()
      .describe("Replacement incident trigger for the monitor rule."),
    metric: MonitorMetricSchema.optional().describe("Replacement metric evaluated by the monitor."),
    condition: AlertConditionSchema.optional().describe("Replacement condition for threshold or escalating monitors."),
    severity: z.enum(["low", "medium", "high"]).optional().describe("Replacement incident severity."),
  })
  .superRefine((body, ctx) => {
    if (body.trigger === "match" && body.condition !== undefined) {
      ctx.addIssue({ code: "custom", path: ["condition"], message: "Match monitors cannot define a condition." })
    }
    if (body.trigger === "threshold" && body.condition !== undefined && body.condition.trigger !== "threshold") {
      ctx.addIssue({
        code: "custom",
        path: ["condition"],
        message: "Threshold monitor condition must use trigger `threshold`.",
      })
    }
    if (body.trigger === "escalating" && body.condition !== undefined && body.condition.trigger !== "escalating") {
      ctx.addIssue({
        code: "custom",
        path: ["condition"],
        message: "Escalating monitor condition must use trigger `escalating`.",
      })
    }
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
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "list",
    summary: "List monitors",
    description: "Returns the project's monitors, system monitors first, then by most recent activity.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListMonitorsQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedMonitorsSchema, description: "Page of monitors" }),
  }),
  rateLimitTier: "low",
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
          Layer.mergeAll(
            ProjectRepositoryLive,
            MonitorRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentRepositoryLive,
            OutboxEventWriterLive,
          ),
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
    annotations: { readOnlyHint: false, destructiveHint: false },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "create",
    summary: "Create monitor",
    description: "Creates a monitor with one rule. The slug is derived from `name`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateMonitorBodySchema) },
    responses: openApiResponses({ status: 201, schema: MonitorSchema, description: "Monitor created" }),
  }),
  rateLimitTier: "medium",
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
      }).pipe(
        withPostgres(
          // SavedSearchRepository backs the semantic-search monitorability check on the watched search.
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive, SavedSearchRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toMonitorResponse(monitor), 201)
  },
})

const listMonitorsForTarget = monitorEndpoint({
  route: createRoute({
    method: "post",
    path: "/for-target",
    name: "listMonitorsForTarget",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "listForTarget",
    summary: "List monitors for target",
    description: "Returns live monitors matching the supplied target type and/or filter subset.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(ListMonitorsForTargetBodySchema) },
    responses: openApiResponses({ status: 200, schema: MonitorListSchema, description: "Matching monitors" }),
  }),
  rateLimitTier: "low",
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const monitors = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* listMonitorsForTargetUseCase({
          projectId: project.id,
          ...(body.targetType !== undefined ? { targetType: body.targetType } : {}),
          filterSetContains: body.filterSetContains,
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

    return c.json({ items: monitors.map(toMonitorResponse) }, 200)
  },
})

const getMonitor = monitorEndpoint({
  route: createRoute({
    method: "get",
    path: "/{monitorSlug}",
    name: "getMonitor",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "get",
    summary: "Get monitor",
    description: "Returns a single monitor by slug.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: MonitorSchema, description: "Monitor" }),
  }),
  rateLimitTier: "low",
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
    annotations: { readOnlyHint: false, destructiveHint: true },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "update",
    summary: "Update monitor",
    description: "Updates a monitor's metadata, target, and rule. System monitor edits are restricted.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema, body: jsonBody(UpdateMonitorBodySchema) },
    responses: openApiResponses({
      status: 200,
      schema: MonitorSchema,
      description: "Updated monitor",
      extraErrors: { 403: { description: "System monitors cannot be edited" } },
    }),
  }),
  rateLimitTier: "medium",
  handler: async (c) => {
    const { projectSlug, monitorSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getMonitorBySlugUseCase({ projectId: project.id, slug: monitorSlug })
        const targetPatch = body.target
        const metric = body.metric ?? current.target.metric
        const target =
          targetPatch !== undefined || body.metric !== undefined
            ? {
                ...current.target,
                ...(targetPatch
                  ? {
                      type: targetPatch.type,
                      id: targetPatch.id,
                      kind: targetPatch.type,
                      stream: streamForTargetType(targetPatch.type),
                      query: targetPatch.query ?? null,
                      savedSearchId: targetPatch.type === "savedSearch" ? targetPatch.id : null,
                      ...(targetPatch.filterSet !== undefined
                        ? { filterSet: targetPatch.filterSet }
                        : { filterSet: undefined }),
                    }
                  : {}),
                metric,
              }
            : undefined
        const trigger = body.trigger ?? current.rule.trigger
        const hasCondition = Object.hasOwn(body, "condition")
        const condition = hasCondition
          ? body.condition
          : trigger === "match"
            ? undefined
            : current.rule.config.condition
        if (trigger === "match" && condition !== undefined) {
          throw new BadRequestError({ message: "Match monitors cannot define a condition." })
        }
        if (trigger === "threshold" && condition?.trigger !== "threshold") {
          throw new BadRequestError({ message: "Threshold monitors require a threshold condition." })
        }
        if (trigger === "escalating" && condition?.trigger !== "escalating") {
          throw new BadRequestError({ message: "Escalating monitors require an escalating condition." })
        }
        const rule =
          body.trigger !== undefined || body.metric !== undefined || hasCondition || body.severity !== undefined
            ? (() => {
                const { condition: _condition, ...currentConfig } = current.rule.config
                return {
                  trigger,
                  severity: body.severity ?? current.rule.severity,
                  config: {
                    ...currentConfig,
                    metric,
                    ...(condition !== undefined ? { condition } : {}),
                  },
                }
              })()
            : undefined
        return yield* updateMonitorUseCase({
          id: current.id,
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(target !== undefined ? { target } : {}),
          ...(rule !== undefined ? { rule } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            ProjectRepositoryLive,
            MonitorRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentRepositoryLive,
            OutboxEventWriterLive,
          ),
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
    annotations: { readOnlyHint: false, destructiveHint: true },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "delete",
    summary: "Delete monitor",
    description: "Deletes a monitor. System monitors cannot be deleted.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiNoContentResponses({ description: "Monitor deleted" }),
  }),
  rateLimitTier: "medium",
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
          Layer.mergeAll(ProjectRepositoryLive, MonitorRepositoryLive, IncidentRepositoryLive, OutboxEventWriterLive),
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
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "listIncidents",
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
  rateLimitTier: "low",
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
            IncidentRepositoryLive,
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
    annotations: { readOnlyHint: false, destructiveHint: false },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "mute",
    summary: "Mute monitor",
    description: "Mutes a monitor so its incidents stop sending notifications. Allowed on all monitors.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: MonitorSchema, description: "Muted monitor" }),
  }),
  rateLimitTier: "medium",
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
    annotations: { readOnlyHint: false, destructiveHint: false },
    tags: ["Monitors"],
    group: "monitors",
    sdkMethod: "unmute",
    summary: "Unmute monitor",
    description: "Lifts a monitor's mute so its incidents notify again.",
    security: PROTECTED_SECURITY,
    request: { params: MonitorSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: MonitorSchema, description: "Unmuted monitor" }),
  }),
  rateLimitTier: "medium",
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
