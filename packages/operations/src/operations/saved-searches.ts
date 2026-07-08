import { ProjectRepository } from "@domain/projects"
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearchBySlug,
  listSavedSearches,
  SAVED_SEARCH_NAME_MAX_LENGTH,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  updateSavedSearch,
} from "@domain/saved-searches"
import { BadRequestError, OrganizationId, ProjectId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { createRoute, z } from "@hono/zod-openapi"
import { AIEmbedLive, withAi } from "@platform/ai"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  SavedSearchRepositoryLive,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { SavedSearchSchema, toSavedSearchResponse } from "../openapi/entities/saved-search.ts"
import {
  decodeTraceCursor,
  encodeTraceCursor,
  fetchTraceIndicators,
  PaginatedTracesSchema,
  TRACE_SORT_FIELDS,
  toTraceResponse,
} from "../openapi/entities/trace.ts"
import { Paginated, PaginatedQueryParamsSchema } from "../openapi/pagination.ts"
import {
  FilterSetSchema,
  jsonBody,
  openApiNoContentResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"
import { requireOAuthUserId } from "../utils/require-oauth.ts"

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
  })
  .openapi("UpdateSavedSearchBody")

const PaginatedSavedSearchesSchema = Paginated(SavedSearchSchema, "PaginatedSavedSearches")

const savedSearchesPath = "/projects/:projectSlug/searches"

const savedSearchEndpoint = defineOperation<OrganizationScopedEnv>(savedSearchesPath)

const listSavedSearchesEndpoint = savedSearchEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listSavedSearches",
    tags: ["Saved Searches"],
    group: "savedSearches",
    sdkMethod: "list",
    summary: "List saved searches",
    description:
      "Returns every saved search in the project. The response uses the standard paginated shape; the saved-search list currently fits in a single page (`nextCursor` is always `null`).",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: typedResponses({
      status: 200,
      schema: PaginatedSavedSearchesSchema,
      description: "List of saved searches",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const page = yield* listSavedSearches({ projectId: project.id })
      return {
        status: 200,
        body: { items: page.items.map(toSavedSearchResponse), nextCursor: null, hasMore: false },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const getSavedSearch = savedSearchEndpoint({
  route: createRoute({
    method: "get",
    path: "/{searchSlug}",
    name: "getSavedSearch",
    tags: ["Saved Searches"],
    group: "savedSearches",
    sdkMethod: "get",
    summary: "Get saved search",
    description: "Returns a single saved search by slug.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema },
    responses: typedResponses({ status: 200, schema: SavedSearchSchema, description: "Saved search" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const search = yield* getSavedSearchBySlug({ projectId: project.id, slug: input.params.searchSlug })
      return { status: 200, body: toSavedSearchResponse(search) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const createSavedSearchEndpoint = savedSearchEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createSavedSearch",
    tags: ["Saved Searches"],
    group: "savedSearches",
    sdkMethod: "create",
    summary: "Create saved search",
    description:
      "Creates a saved search within the project. At least one of `query` or `filters` must be set. The slug is derived from `name`. OAuth-authenticated only.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateRequestSchema) },
    responses: typedResponses({ status: 201, schema: SavedSearchSchema, description: "Saved search created" }),
  }),
  access: "write",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const body = input.body
      const createdByUserId = yield* requireOAuthUserId(ctx.auth)

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)

      const search = yield* createSavedSearch({
        projectId: project.id,
        name: body.name,
        query: body.query,
        filterSet: body.filters,
        createdByUserId,
      })
      return { status: 201, body: toSavedSearchResponse(search) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const updateSavedSearchEndpoint = savedSearchEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{searchSlug}",
    name: "updateSavedSearch",
    tags: ["Saved Searches"],
    group: "savedSearches",
    sdkMethod: "update",
    summary: "Update saved search",
    description:
      "Updates a saved search. Renaming may regenerate the slug — clients should re-read the response or rely on the `id` for stable references.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema, body: jsonBody(UpdateRequestSchema) },
    responses: typedResponses({ status: 200, schema: SavedSearchSchema, description: "Updated saved search" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const body = input.body
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const current = yield* getSavedSearchBySlug({ projectId: project.id, slug: input.params.searchSlug })

      const updated = yield* updateSavedSearch({
        id: current.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.query !== undefined ? { query: body.query } : {}),
        ...(body.filters !== undefined ? { filterSet: body.filters } : {}),
      })
      return { status: 200, body: toSavedSearchResponse(updated) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const deleteSavedSearchEndpoint = savedSearchEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{searchSlug}",
    name: "deleteSavedSearch",
    tags: ["Saved Searches"],
    group: "savedSearches",
    sdkMethod: "delete",
    summary: "Delete saved search",
    description: "Deletes a saved search by slug.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema },
    responses: openApiNoContentResponses({ description: "Saved search deleted" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const current = yield* getSavedSearchBySlug({ projectId: project.id, slug: input.params.searchSlug })
      yield* deleteSavedSearch({ savedSearchId: current.id })
      return { status: 204 } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const ListSavedSearchTracesQuerySchema = PaginatedQueryParamsSchema.extend({
  sortBy: z
    .enum(TRACE_SORT_FIELDS)
    .default("startTime")
    .describe(
      "Field to sort by. Defaults to `startTime`. Pass `relevance` to rank by semantic match against the saved search's query (best match first, then most recent).",
    ),
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
    group: "savedSearches",
    sdkMethod: "listTraces",
    summary: "List traces matching a saved search",
    description:
      "Returns a cursor-paginated page of traces that match the saved search's `query` + `filters`. Each row uses the same `Trace` shape as `listTraces` — use the trace point-lookup endpoints (`getTrace`, `listTraceSpans`, `getTraceSpan`, `listTraceAnnotations`) to drill into individual traces.",
    security: PROTECTED_SECURITY,
    request: { params: SearchSlugParamsSchema, query: ListSavedSearchTracesQuerySchema },
    responses: typedResponses({ status: 200, schema: PaginatedTracesSchema, description: "Page of traces" }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, searchSlug } = input.params
      const query = input.query

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
      const projectId = ProjectId(project.id as string)
      const search = yield* getSavedSearchBySlug({ projectId: project.id, slug: searchSlug })

      const traceRepo = yield* TraceRepository
      const page = yield* traceRepo.listByProjectId({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId,
        options: {
          limit: query.limit,
          sortBy: query.sortBy,
          sortDirection: query.sortDirection,
          ...(cursor ? { cursor } : {}),
          ...(Object.keys(search.filterSet).length > 0 ? { filters: search.filterSet } : {}),
          ...(search.query ? { searchQuery: search.query } : {}),
        },
      })

      const indicators = yield* fetchTraceIndicators({
        projectId,
        traceIds: page.items.map((trace) => trace.traceId),
      })

      return {
        status: 200,
        body: {
          items: page.items.map((trace) => toTraceResponse(trace, indicators)),
          nextCursor: page.nextCursor ? encodeTraceCursor(page.nextCursor) : null,
          hasMore: page.hasMore,
        },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SavedSearchRepositoryLive, ScoreRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(TraceRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withAi(AIEmbedLive, ctx.redis),
      withTracing,
    ),
})

export const savedSearchesModule: OperationModule = {
  path: savedSearchesPath,
  operations: [
    listSavedSearchesEndpoint,
    getSavedSearch,
    createSavedSearchEndpoint,
    updateSavedSearchEndpoint,
    deleteSavedSearchEndpoint,
    listSavedSearchTraces,
  ],
}
