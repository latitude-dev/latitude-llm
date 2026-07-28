import { FLAGGER_STRATEGY_SLUGS, type FlaggerSlug, updateFlaggerUseCase } from "@domain/flaggers"
import {
  type CreateProjectInput,
  createProjectUseCase,
  type Project,
  ProjectRepository,
  updateProjectRedactionUseCase,
  updateProjectUseCase,
} from "@domain/projects"
import {
  DEFAULT_REDACTION_ENTITIES,
  type INCIDENT_NOTIFICATION_KEYS,
  REDACTION_ENTITIES,
  REDACTION_IDENTITY_HANDLINGS,
  REDACTION_MODES,
} from "@domain/shared"
import { createRoute, z } from "@hono/zod-openapi"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  FlaggerRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { Paginated } from "../openapi/pagination.ts"
import {
  jsonBody,
  openApiNoContentResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// Project-settings shape, expressed at the API layer so each field carries a
// description (the domain `projectSettingsSchema` is description-free by
// design). The field-by-field shape mirrors `projectSettingsSchema` from
// `@domain/shared`; the per-alert-kind toggles are spelled out so each one is
// individually documented for SDK / MCP consumers.
const IncidentNotificationsSettingSchema = z
  .object({
    "signal.escalating": z
      .boolean()
      .optional()
      .describe(
        "Send a notification when an active signal is escalating in volume or severity. Defaults to `true` when omitted.",
      ),
    "monitor.match": z
      .boolean()
      .optional()
      .describe("Send a notification when a match monitor opens an incident. Defaults to `true` when omitted."),
    "monitor.threshold": z
      .boolean()
      .optional()
      .describe("Send a notification when a threshold monitor opens an incident. Defaults to `true` when omitted."),
    "monitor.escalating": z
      .boolean()
      .optional()
      .describe("Send a notification when an escalating monitor opens an incident. Defaults to `true` when omitted."),
  })
  .openapi("IncidentNotificationsSetting")

type _IncidentNotificationKeysCovered = Exclude<
  (typeof INCIDENT_NOTIFICATION_KEYS)[number],
  keyof z.infer<typeof IncidentNotificationsSettingSchema>
>
const _incidentNotificationKeysAreCovered: _IncidentNotificationKeysCovered extends never ? true : false = true
void _incidentNotificationKeysAreCovered

const DestinationNotificationsSettingSchema = z
  .object({
    quarantine: z
      .boolean()
      .optional()
      .describe(
        "Notify org members when a data destination is quarantined after repeated sync failures. Defaults to `true` when omitted.",
      ),
  })
  .openapi("DestinationNotificationsSetting")

const NotificationsSettingSchema = z
  .object({
    incidents: IncidentNotificationsSettingSchema.optional().describe(
      "Per-alert-kind opt-out for incident notifications.",
    ),
    destinations: DestinationNotificationsSettingSchema.optional().describe(
      "Project-level opt-out for data-destination notifications.",
    ),
  })
  .openapi("NotificationsSetting")

const EscalationSettingSchema = z
  .object({
    sensitivity: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe(
        "Sensitivity of the escalation detector, 1 (most sensitive, more incidents) to 6 (least sensitive, fewer incidents). Defaults to a balanced value when omitted.",
      ),
  })
  .openapi("EscalationSetting")

const RedactionSettingSchema = z
  .object({
    mode: z
      .enum(REDACTION_MODES)
      .optional()
      .describe(
        "`enforce` scans span content as it is ingested and replaces matches with a labelled placeholder such as `[REDACTED_EMAIL]`; `off` scans nothing. Defaults to `off` when omitted. Applies only to spans ingested after the change, takes effect within a minute, and redacted content cannot be recovered.",
      ),
    entities: z
      .array(z.enum(REDACTION_ENTITIES))
      .optional()
      .describe(
        `Which categories to look for. Defaults to ${DEFAULT_REDACTION_ENTITIES.join(", ")} when omitted; \`ip_address\` and \`crypto_wallet\` are off by default because they also match version strings and hex hashes. Detection is pattern based: it reliably catches structured identifiers, and does not catch names, addresses, or free-form personal detail.`,
      ),
    scopes: z
      .object({
        metadata: z
          .boolean()
          .optional()
          .describe(
            "Also scan the metadata map and tags. Defaults to `false` when omitted, because metadata is usually operational and redacting it removes values you filter and group by.",
          ),
      })
      .optional()
      .describe("Which span fields to scan beyond message and tool content."),
    identities: z
      .enum(REDACTION_IDENTITY_HANDLINGS)
      .optional()
      .describe(
        "How to handle `userId` and `userEmail`. `keep` stores them unchanged; `pseudonymize` replaces each with a stable per-organization pseudonym so filtering and grouping by user keep working. Defaults to `keep` when omitted. Deployments with no pseudonym secret configured remove the identifier entirely instead.",
      ),
  })
  .openapi("RedactionSetting")

const ProjectSettingsSchema = z
  .object({
    keepMonitoring: z
      .boolean()
      .optional()
      .describe(
        "When `true`, the evaluation linked to an signal keeps running after the signal is resolved. When `false`, resolving the signal stops the evaluation. Defaults to `true` when omitted.",
      ),
    redaction: RedactionSettingSchema.optional().describe(
      "Server-side PII redaction applied before spans are stored. An organization-wide policy can override this one; when the organization locks its policy, project values are ignored entirely rather than merged.",
    ),
    notifications: NotificationsSettingSchema.optional().describe(
      "Per-group project-level notification toggles (`incidents`, `destinations`).",
    ),
    escalation: EscalationSettingSchema.optional().describe(
      "Tuning parameters for the escalation detector. Affects detector behaviour regardless of whether notifications are enabled.",
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
        "URL-safe slug. Set from `name` at creation; renaming never changes it. It can only be changed from the dashboard, not via the API.",
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
    name: z.string().min(1).optional().describe("New human-readable name. Renaming never changes the slug."),
    settings: ProjectSettingsSchema.optional().describe(
      "Patch the project's settings overrides. Only the fields you send are changed; omitted fields keep their stored values. To clear overrides entirely, edit via the web UI.",
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
  settings: ProjectSettingsSchema.nullable().safeParse(project.settings).data ?? null,
  firstTraceAt: project.firstTraceAt ? project.firstTraceAt.toISOString() : null,
  deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
  lastEditedAt: project.lastEditedAt.toISOString(),
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
})

const projectsPath = "/projects"

const projectEndpoint = defineOperation<OrganizationScopedEnv>(projectsPath)

const createProject = projectEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createProject",
    tags: ["Projects"],
    group: "projects",
    sdkMethod: "create",
    summary: "Create project",
    description: "Creates a new project within the organization. The name must be unique within the org.",
    security: PROTECTED_SECURITY,
    request: {
      body: jsonBody(CreateRequestSchema),
    },
    responses: typedResponses({ status: 201, schema: ResponseSchema, description: "Project created" }),
  }),
  access: "write",
  rateLimitTier: "high",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const createInput: CreateProjectInput = { name: input.body.name }
      const project = yield* createProjectUseCase(createInput)
      return { status: 201, body: toResponse(project) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const listProjects = projectEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listProjects",
    tags: ["Projects"],
    group: "projects",
    sdkMethod: "list",
    summary: "List projects",
    description:
      "Returns every project in the organization. The response uses the standard paginated shape; the project list currently fits in a single page (`nextCursor` is always `null`).",
    security: PROTECTED_SECURITY,
    responses: typedResponses({ status: 200, schema: PaginatedProjectsSchema, description: "List of projects" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (_input, ctx) =>
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      const projects = yield* repo.list()
      return { status: 200, body: { items: projects.map(toResponse), nextCursor: null, hasMore: false } } as const
    }).pipe(withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

const getProject = projectEndpoint({
  route: createRoute({
    method: "get",
    path: "/{projectSlug}",
    name: "getProject",
    tags: ["Projects"],
    group: "projects",
    sdkMethod: "get",
    summary: "Get project",
    description: "Returns a single project by slug.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: typedResponses({ status: 200, schema: ResponseSchema, description: "Project" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      const project = yield* repo.findBySlug(input.params.projectSlug)
      return { status: 200, body: toResponse(project) } as const
    }).pipe(withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

const updateProject = projectEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{projectSlug}",
    name: "updateProject",
    tags: ["Projects"],
    group: "projects",
    sdkMethod: "update",
    summary: "Update project",
    description:
      "Updates a project's name and/or settings. Renaming never changes the slug, and the slug cannot be changed via the API (only from the dashboard). Use `id` or `slug` as stable references.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(UpdateRequestSchema),
    },
    responses: typedResponses({ status: 200, schema: ResponseSchema, description: "Updated project" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const body = input.body
      const actorUserId = ctx.auth.method === "oauth" ? (ctx.auth.userId as string) : undefined

      const repo = yield* ProjectRepository
      const project = yield* repo.findBySlug(input.params.projectSlug)

      let updated = yield* updateProjectUseCase({
        id: project.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        // Patch, not replace: this schema exposes a subset of the stored settings,
        // so a replace would let one field's update silently clear the others.
        ...(body.settings !== undefined ? { settingsPatch: body.settings } : {}),
      })

      // `updateProjectUseCase` refuses to write `redaction`, so the policy goes through its
      // own use case to pick up the audit event that an irreversible change needs.
      if (body.settings?.redaction !== undefined) {
        updated = yield* updateProjectRedactionUseCase({
          projectId: project.id,
          actorUserId: actorUserId ?? "",
          redaction: body.settings.redaction,
        })
      }

      if (body.flaggers) {
        for (const [slug, enabled] of Object.entries(body.flaggers)) {
          yield* updateFlaggerUseCase({
            organizationId: ctx.organization.id,
            projectId: updated.id,
            slug: slug as FlaggerSlug,
            enabled,
            ...(actorUserId !== undefined ? { actorUserId } : {}),
          })
        }
      }

      return { status: 200, body: toResponse(updated) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, FlaggerRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      Effect.provide(RedisCacheStoreLive(ctx.redis)),
      withTracing,
    ),
})

const deleteProject = projectEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{projectSlug}",
    name: "deleteProject",
    tags: ["Projects"],
    group: "projects",
    sdkMethod: "delete",
    summary: "Delete project",
    description: "Deletes a project by slug.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: openApiNoContentResponses({ description: "Project deleted" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      const project = yield* repo.findBySlug(input.params.projectSlug)
      yield* repo.softDelete(project.id)
      return { status: 204 } as const
    }).pipe(withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

export const projectsModule: OperationModule = {
  path: projectsPath,
  operations: [createProject, listProjects, getProject, updateProject, deleteProject],
}
