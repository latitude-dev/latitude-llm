import { FLAGGER_STRATEGY_SLUGS, type FlaggerSlug, updateFlaggerUseCase } from "@domain/flaggers"
import {
  type CreateProjectInput,
  createProjectUseCase,
  type Project,
  ProjectRepository,
  updateProjectUseCase,
} from "@domain/projects"
import type { ALERT_INCIDENT_KINDS } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  FlaggerRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { Paginated } from "../openapi/pagination.ts"
import {
  jsonBody,
  openApiNoContentResponses,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// Fern uses `x-fern-sdk-group-name` + `x-fern-sdk-method-name` to derive the
// SDK resource namespace (`client.projects.*`) and method names independently
// of the OpenAPI `tag` and `operationId`. Without these explicit overrides Fern
// falls back to deriving SDK names from the (multi-word) tag, which produces
// awkward `projectsList`-style methods and case-sensitivity issues on CI.
const projectsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "projects",
    "x-fern-sdk-method-name": methodName,
  }) as const

// Project-settings shape, expressed at the API layer so each field carries a
// description (the domain `projectSettingsSchema` is description-free by
// design). The field-by-field shape mirrors `projectSettingsSchema` from
// `@domain/shared`; the per-alert-kind toggles are spelled out so each one is
// individually documented for SDK / MCP consumers.
const AlertNotificationsSettingSchema = z
  .object({
    "issue.new": z
      .boolean()
      .optional()
      .describe("Send a notification when a new issue is discovered. Defaults to `true` when omitted."),
    "issue.regressed": z
      .boolean()
      .optional()
      .describe("Send a notification when a previously-resolved issue regresses. Defaults to `true` when omitted."),
    "issue.escalating": z
      .boolean()
      .optional()
      .describe(
        "Send a notification when an active issue is escalating in volume or severity. Defaults to `true` when omitted.",
      ),
    escalationSensitivity: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe(
        "Sensitivity of the escalation detector, 1 (most sensitive, more notifications) to 6 (least sensitive, fewer notifications). Defaults to a balanced value when omitted.",
      ),
  })
  .openapi("AlertNotificationsSetting")

// Assert at compile time that the API schema covers every alert kind the
// domain knows about — adding a new entry to `ALERT_INCIDENT_KINDS` makes
// this assertion fail until we describe the new key here too.
type _AlertKindsCovered = Exclude<
  (typeof ALERT_INCIDENT_KINDS)[number],
  keyof z.infer<typeof AlertNotificationsSettingSchema>
>
const _alertKindsAreCovered: _AlertKindsCovered extends never ? true : false = true
void _alertKindsAreCovered

const ProjectSettingsSchema = z
  .object({
    keepMonitoring: z
      .boolean()
      .optional()
      .describe(
        "When `true`, the evaluation linked to an issue keeps running after the issue is resolved. When `false`, resolving the issue stops the evaluation. Defaults to `true` when omitted.",
      ),
    alertNotifications: AlertNotificationsSettingSchema.optional().describe(
      "Per-alert-kind in-app notification toggles plus escalation-detector tuning. Omit to keep current values.",
    ),
  })
  .openapi("ProjectSettings")

const ResponseSchema = z
  .object({
    id: z.string().describe("Stable project identifier (CUID2)."),
    organizationId: z.string().describe("Organization that owns this project."),
    name: z.string().describe("Human-readable name."),
    slug: z
      .string()
      .describe(
        "URL-safe slug derived from `name`. Regenerated when the name changes in a way that affects the slug form.",
      ),
    settings: ProjectSettingsSchema.nullable().describe(
      "Per-project settings overrides. `null` means inherit from the organization.",
    ),
    firstTraceAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp of the first ingested trace. `null` until the first trace lands."),
    deletedAt: z
      .string()
      .nullable()
      .describe("ISO-8601 timestamp at which the project was deleted. `null` while the project is active."),
    lastEditedAt: z.string().describe("ISO-8601 timestamp of the most recent name/settings edit."),
    createdAt: z.string().describe("ISO-8601 timestamp of creation."),
    updatedAt: z.string().describe("ISO-8601 timestamp of the last metadata change."),
  })
  .openapi("Project")

const PaginatedProjectsSchema = Paginated(ResponseSchema, "PaginatedProjects")

const CreateRequestSchema = z
  .object({
    name: z.string().min(1).describe("Human-readable name for the project. Must be unique within the organization."),
  })
  .openapi("CreateProjectBody")

const UpdateRequestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .optional()
      .describe(
        "New human-readable name. Triggers slug regeneration when the change affects the slug form (cosmetic edits like capitalization keep the URL stable).",
      ),
    settings: ProjectSettingsSchema.optional().describe(
      "Replace the project's settings overrides. Omit to leave settings untouched. To clear overrides entirely, edit via the web UI.",
    ),
    flaggers: z
      .partialRecord(z.enum(FLAGGER_STRATEGY_SLUGS), z.boolean())
      .optional()
      .describe(
        "Enable or disable specific flaggers for the project. Keys are flagger slugs; values are the new `enabled` state. Omitted slugs are left untouched.",
      ),
  })
  .openapi("UpdateProjectBody")

const toResponse = (project: Project) => ({
  id: project.id as string,
  organizationId: project.organizationId as string,
  name: project.name,
  slug: project.slug,
  settings: project.settings,
  firstTraceAt: project.firstTraceAt ? project.firstTraceAt.toISOString() : null,
  deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
  lastEditedAt: project.lastEditedAt.toISOString(),
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
})

export const projectsPath = "/projects"

const projectEndpoint = defineApiEndpoint<OrganizationScopedEnv>(projectsPath)

const createProject = projectEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createProject",
    tags: ["Projects"],
    ...projectsFernGroup("create"),
    summary: "Create project",
    description: "Creates a new project within the organization. The name must be unique within the org.",
    security: PROTECTED_SECURITY,
    request: {
      body: jsonBody(CreateRequestSchema),
    },
    responses: openApiResponses({ status: 201, schema: ResponseSchema, description: "Project created" }),
  }),
  handler: async (c) => {
    const body = c.req.valid("json")

    const input: CreateProjectInput = {
      name: body.name,
    }

    const project = await Effect.runPromise(
      createProjectUseCase(input).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          c.var.organization.id,
        ),
        withTracing,
      ),
    )
    return c.json(toResponse(project), 201)
  },
})

const listProjects = projectEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listProjects",
    tags: ["Projects"],
    ...projectsFernGroup("list"),
    summary: "List projects",
    description:
      "Returns every project in the organization. The response uses the standard paginated shape; the project list currently fits in a single page (`nextCursor` is always `null`).",
    security: PROTECTED_SECURITY,
    responses: openApiResponses({ status: 200, schema: PaginatedProjectsSchema, description: "List of projects" }),
  }),
  handler: async (c) => {
    const projects = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.list()
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id), withTracing),
    )

    return c.json({ items: projects.map(toResponse), nextCursor: null, hasMore: false }, 200)
  },
})

const getProject = projectEndpoint({
  route: createRoute({
    method: "get",
    path: "/{projectSlug}",
    name: "getProject",
    tags: ["Projects"],
    ...projectsFernGroup("get"),
    summary: "Get project",
    description: "Returns a single project by slug.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: openApiResponses({ status: 200, schema: ResponseSchema, description: "Project" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")

    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findBySlug(projectSlug)
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id), withTracing),
    )

    return c.json(toResponse(project), 200)
  },
})

const updateProject = projectEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{projectSlug}",
    name: "updateProject",
    tags: ["Projects"],
    ...projectsFernGroup("update"),
    summary: "Update project",
    description:
      "Updates a project's name and/or settings. Renaming may regenerate the slug — clients should re-read the response or rely on the `id` for stable references.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(UpdateRequestSchema),
    },
    responses: openApiResponses({ status: 200, schema: ResponseSchema, description: "Updated project" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id
    const actorUserId = c.var.auth?.method === "oauth" ? (c.var.auth.userId as string) : undefined

    const updatedProject = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        const project = yield* repo.findBySlug(projectSlug)

        const updated = yield* updateProjectUseCase({
          id: project.id,
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.settings !== undefined ? { settings: body.settings } : {}),
        })

        if (body.flaggers) {
          for (const [slug, enabled] of Object.entries(body.flaggers)) {
            yield* updateFlaggerUseCase({
              organizationId,
              projectId: updated.id,
              slug: slug as FlaggerSlug,
              enabled,
              ...(actorUserId !== undefined ? { actorUserId } : {}),
            })
          }
        }

        return updated
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, FlaggerRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          c.var.organization.id,
        ),
        Effect.provide(RedisCacheStoreLive(c.var.redis)),
        withTracing,
      ),
    )

    return c.json(toResponse(updatedProject), 200)
  },
})

const deleteProject = projectEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{projectSlug}",
    name: "deleteProject",
    tags: ["Projects"],
    ...projectsFernGroup("delete"),
    summary: "Delete project",
    description: "Deletes a project by slug.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: openApiNoContentResponses({ description: "Project deleted" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        const project = yield* repo.findBySlug(projectSlug)
        return yield* repo.softDelete(project.id)
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id), withTracing),
    )
    return c.body(null, 204)
  },
})

export const createProjectsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  for (const ep of [createProject, listProjects, getProject, updateProject, deleteProject]) {
    ep.mountHttp(app)
  }
  return app
}
