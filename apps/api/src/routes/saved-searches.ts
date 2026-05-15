import { ProjectRepository } from "@domain/projects"
import {
  assignSavedSearchUseCase,
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearchBySlug,
  listSavedSearches,
  SAVED_SEARCH_NAME_MAX_LENGTH,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  updateSavedSearch,
} from "@domain/saved-searches"
import { BadRequestError, cuidSchema, OrganizationId, ProjectId, SavedSearchId, UserId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  SavedSearchRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import { SavedSearchSchema, toSavedSearchResponse } from "../openapi/entities/saved-search.ts"
import {
  decodeTraceCursor,
  encodeTraceCursor,
  PaginatedTracesSchema,
  TRACE_SORT_FIELDS,
  toTraceResponse,
} from "../openapi/entities/trace.ts"
import { Paginated, PaginatedQueryParamsSchema } from "../openapi/pagination.ts"
import {
  FilterSetSchema,
  jsonBody,
  openApiNoContentResponses,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"
import { requireOAuthUserId } from "../utils/require-oauth.ts"

const savedSearchesFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "savedSearches",
    "x-fern-sdk-method-name": methodName,
  }) as const

const SearchSlugParamsSchema = ProjectParamsSchema.extend({
  searchSlug: z.string().describe("Saved-search slug (human-readable identifier within the project)."),
})

const CreateRequestSchema = z
  .object({
    name: z.string().min(1).max(SAVED_SEARCH_NAME_MAX_LENGTH).describe("Human-readable name. Used to derive the slug."),
    query: z
      .string()
      .max(SAVED_SEARCH_QUERY_MAX_LENGTH)
      .nullable()
      .default(null)
      .describe(
        "Free-text semantic query. `null` (default) when the search is filter-only. At least one of `query` or `filters` must be set.",
      ),
    filters: FilterSetSchema.default({}).describe(
      "Structured filter set. Defaults to `{}` (no filters). At least one of `query` or `filters` must be set.",
    ),
    assignedUserId: cuidSchema
      .nullable()
      .default(null)
      .describe("User to assign the search to. `null` (default) leaves the search unassigned."),
  })
  .openapi("CreateSavedSearchBody")

const UpdateRequestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(SAVED_SEARCH_NAME_MAX_LENGTH)
      .optional()
      .describe(
        "New human-readable name. Triggers slug regeneration when the change affects the slug form (cosmetic edits like capitalization keep the URL stable).",
      ),
    query: z
      .string()
      .max(SAVED_SEARCH_QUERY_MAX_LENGTH)
      .nullable()
      .optional()
      .describe("Replace the free-text query. Pass `null` to clear it."),
    filters: FilterSetSchema.optional().describe("Replace the structured filter set."),
    assignedUserId: cuidSchema
      .nullable()
      .optional()
      .describe(
        "Replace the assignee. Pass `null` to clear it. Use the dedicated `/assign` endpoint to validate membership.",
      ),
  })
  .openapi("UpdateSavedSearchBody")

const AssignRequestSchema = z
  .object({
    userId: cuidSchema.nullable().describe("User to assign the search to, or `null` to clear the current assignment."),
  })
  .openapi("AssignSavedSearchBody")

const PaginatedSavedSearchesSchema = Paginated(SavedSearchSchema, "PaginatedSavedSearches")

export const savedSearchesPath = "/projects/:projectSlug/searches"

const savedSearchEndpoint = defineApiEndpoint<OrganizationScopedEnv>(savedSearchesPath)

const listSavedSearchesEndpoint = savedSearchEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listSavedSearches",
    tags: ["Saved Searches"],
    ...savedSearchesFernGroup("list"),
    summary: "List saved searches",
    description:
      "Returns every saved search in the project. The response uses the standard paginated shape; the saved-search list currently fits in a single page (`nextCursor` is always `null`).",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: openApiResponses({
      status: 200,
      schema: PaginatedSavedSearchesSchema,
      description: "List of saved searches",
    }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* listSavedSearches({ projectId: project.id })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json({ items: page.items.map(toSavedSearchResponse), nextCursor: null, hasMore: false }, 200)
  },
})

const getSavedSearch = savedSearchEndpoint({
  route: createRoute({
    method: "get",
    path: "/{searchSlug}",
    name: "getSavedSearch",
    tags: ["Saved Searches"],
    ...savedSearchesFernGroup("get"),
    summary: "Get saved search",
    description: "Returns a single saved search by slug.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: SavedSearchSchema, description: "Saved search" }),
  }),
  handler: async (c) => {
    const { projectSlug, searchSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const search = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* getSavedSearchBySlug({ projectId: project.id, slug: searchSlug })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toSavedSearchResponse(search), 200)
  },
})

const createSavedSearchEndpoint = savedSearchEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createSavedSearch",
    tags: ["Saved Searches"],
    ...savedSearchesFernGroup("create"),
    summary: "Create saved search",
    description:
      "Creates a saved search within the project. At least one of `query` or `filters` must be set. The slug is derived from `name`. OAuth-authenticated only — the authenticated user becomes the search's `createdByUserId`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateRequestSchema) },
    responses: openApiResponses({ status: 201, schema: SavedSearchSchema, description: "Saved search created" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id
    const createdByUserId = requireOAuthUserId(c)

    const search = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        return yield* createSavedSearch({
          projectId: project.id,
          name: body.name,
          query: body.query,
          filterSet: body.filters,
          assignedUserId: body.assignedUserId !== null ? UserId(body.assignedUserId) : null,
          createdByUserId,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toSavedSearchResponse(search), 201)
  },
})

const updateSavedSearchEndpoint = savedSearchEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{searchSlug}",
    name: "updateSavedSearch",
    tags: ["Saved Searches"],
    ...savedSearchesFernGroup("update"),
    summary: "Update saved search",
    description:
      "Updates a saved search. Renaming may regenerate the slug — clients should re-read the response or rely on the `id` for stable references.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema, body: jsonBody(UpdateRequestSchema) },
    responses: openApiResponses({ status: 200, schema: SavedSearchSchema, description: "Updated saved search" }),
  }),
  handler: async (c) => {
    const { projectSlug, searchSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const updated = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getSavedSearchBySlug({ projectId: project.id, slug: searchSlug })

        return yield* updateSavedSearch({
          id: current.id,
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.query !== undefined ? { query: body.query } : {}),
          ...(body.filters !== undefined ? { filterSet: body.filters } : {}),
          ...(body.assignedUserId !== undefined
            ? { assignedUserId: body.assignedUserId !== null ? UserId(body.assignedUserId) : null }
            : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toSavedSearchResponse(updated), 200)
  },
})

const deleteSavedSearchEndpoint = savedSearchEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{searchSlug}",
    name: "deleteSavedSearch",
    tags: ["Saved Searches"],
    ...savedSearchesFernGroup("delete"),
    summary: "Delete saved search",
    description: "Deletes a saved search by slug.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema },
    responses: openApiNoContentResponses({ description: "Saved search deleted" }),
  }),
  handler: async (c) => {
    const { projectSlug, searchSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getSavedSearchBySlug({ projectId: project.id, slug: searchSlug })
        yield* deleteSavedSearch({ savedSearchId: current.id })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.body(null, 204)
  },
})

const assignSavedSearch = savedSearchEndpoint({
  route: createRoute({
    method: "post",
    path: "/{searchSlug}/assign",
    name: "assignSavedSearch",
    tags: ["Saved Searches"],
    ...savedSearchesFernGroup("assign"),
    summary: "Assign saved search",
    description:
      "Assigns the saved search to a user, or clears the current assignment when `userId` is `null`. The assignee must be a member of the requesting organization — otherwise the request is rejected with 400.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema, body: jsonBody(AssignRequestSchema) },
    responses: openApiResponses({ status: 200, schema: SavedSearchSchema, description: "Updated saved search" }),
  }),
  handler: async (c) => {
    const { projectSlug, searchSlug } = c.req.valid("param")
    const { userId } = c.req.valid("json")
    const organizationId = c.var.organization.id

    const updated = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const current = yield* getSavedSearchBySlug({ projectId: project.id, slug: searchSlug })

        return yield* assignSavedSearchUseCase({
          organizationId: OrganizationId(organizationId as string),
          savedSearchId: SavedSearchId(current.id as string),
          assigneeUserId: userId !== null ? UserId(userId) : null,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive, MembershipRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toSavedSearchResponse(updated), 200)
  },
})

const ListSavedSearchTracesQuerySchema = PaginatedQueryParamsSchema.extend({
  sortBy: z.enum(TRACE_SORT_FIELDS).default("startTime").describe("Field to sort by. Defaults to `startTime`."),
  sortDirection: z
    .enum(["asc", "desc"])
    .default("desc")
    .describe("Sort direction. Defaults to `desc` (most recent first)."),
})

const listSavedSearchTraces = savedSearchEndpoint({
  route: createRoute({
    method: "get",
    path: "/{searchSlug}/traces",
    name: "listSavedSearchTraces",
    tags: ["Saved Searches"],
    ...savedSearchesFernGroup("listTraces"),
    summary: "List traces matching a saved search",
    description:
      "Returns a cursor-paginated page of traces that match the saved search's `query` + `filters`. Each row uses the same `Trace` shape as `listTraces` — use the trace point-lookup endpoints (`getTrace`, `listTraceSpans`, `getTraceSpan`, `listTraceAnnotations`) to drill into individual traces.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema, query: ListSavedSearchTracesQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedTracesSchema, description: "Page of traces" }),
  }),
  handler: async (c) => {
    const { projectSlug, searchSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        let cursor: { sortValue: string; traceId: string } | undefined
        if (query.cursor) {
          const decoded = decodeTraceCursor(query.cursor)
          if (!decoded) {
            return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          }
          cursor = decoded
        }

        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const search = yield* getSavedSearchBySlug({ projectId: project.id, slug: searchSlug })

        const traceRepo = yield* TraceRepository
        return yield* traceRepo.listByProjectId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          options: {
            limit: query.limit,
            sortBy: query.sortBy,
            sortDirection: query.sortDirection,
            ...(cursor ? { cursor } : {}),
            ...(Object.keys(search.filterSet).length > 0 ? { filters: search.filterSet } : {}),
            ...(search.query ? { searchQuery: search.query } : {}),
          },
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(TraceRepositoryLive, c.var.clickhouse, organizationId),
        withAi(AIEmbedLive, c.var.redis),
        withTracing,
      ),
    )

    return c.json(
      {
        items: page.items.map(toTraceResponse),
        nextCursor: page.nextCursor ? encodeTraceCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
      },
      200,
    )
  },
})

export const createSavedSearchesRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  listSavedSearchesEndpoint.mountHttp(app, createTierRateLimiter("low"))
  getSavedSearch.mountHttp(app, createTierRateLimiter("low"))
  createSavedSearchEndpoint.mountHttp(app, createTierRateLimiter("low"))
  updateSavedSearchEndpoint.mountHttp(app, createTierRateLimiter("low"))
  deleteSavedSearchEndpoint.mountHttp(app, createTierRateLimiter("low"))
  assignSavedSearch.mountHttp(app, createTierRateLimiter("low"))
  // Same tier as the regular `POST /traces/list` — runs the same ClickHouse
  // semantic-search query, just with the saved search's filters + query
  // resolved server-side.
  listSavedSearchTraces.mountHttp(app, createTierRateLimiter("medium"))
  return app
}
