import {
  computeMemoryDiffUseCase,
  computeRecordChangeDiffUseCase,
  computeRecordHistoryUseCase,
  listMemoryStoresUseCase,
  listRecordUsersUseCase,
  listStoreUsersUseCase,
  MEMORY_STORE_SORT_FIELDS,
  readRecordReadsUseCase,
  reconstructSnapshotUseCase,
} from "@domain/memories"
import { ProjectRepository } from "@domain/projects"
import { BadRequestError, OrganizationId, ProjectId, SpanId } from "@domain/shared"
import { createRoute, z } from "@hono/zod-openapi"
import { MemoryRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import {
  decodeMemoryStoreOffsetCursor,
  encodeMemoryStoreOffsetCursor,
  MemoryRecordChangeDiffSchema,
  MemoryRecordDetailSchema,
  MemoryRecordReadsSchema,
  MemoryRecordUsersSchema,
  MemoryStoreDiffSchema,
  MemoryStoreSnapshotSchema,
  MemoryStoreUsersSchema,
  PaginatedMemoryStoresSchema,
  toMemoryRecordChangeDiffResponse,
  toMemoryRecordDetailResponse,
  toMemoryRecordReadsResponse,
  toMemoryRecordUsersResponse,
  toMemoryStoreDiffResponse,
  toMemoryStoreResponse,
  toMemoryStoreSnapshotResponse,
  toMemoryStoreUsersResponse,
} from "../openapi/entities/memory.ts"
import { PROTECTED_SECURITY, ProjectParamsSchema, spanIdSchema, typedResponses } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const memoryPath = "/projects/:projectSlug/memory"

const memoryEndpoint = defineOperation<OrganizationScopedEnv>(memoryPath)

// Store and record ids are opaque, may contain `/`, and may be empty (the `""`
// unattributed store / unnamed record) — so they ride query params rather than
// path segments, where an empty value or a slash would break routing.
const storeIdQuery = z
  .string()
  .describe('Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store.')

const recordIdQuery = z
  .string()
  .describe("Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record.")

const ListStoresQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
  limit: z.coerce.number().int().min(1).max(200).default(50).describe("Page size. Defaults to 50; max 200."),
  sort: z
    .enum(MEMORY_STORE_SORT_FIELDS)
    .default("lastUpdated")
    .describe("Field to sort by. Defaults to `lastUpdated` (most recently written first)."),
  direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction. Defaults to `desc`."),
})

const listMemoryStores = memoryEndpoint({
  route: createRoute({
    method: "get",
    path: "/stores",
    name: "listMemoryStores",
    tags: ["Memory"],
    group: "memory",
    sdkMethod: "listStores",
    summary: "List memory stores",
    description:
      "Returns a cursor-paginated page of the project's memory stores, one roll-up row each (record count, tokens, last-updated, sessions, users). A store groups records under `gen_ai.memory.store.id`; the empty-string store is the unattributed bucket.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListStoresQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: PaginatedMemoryStoresSchema,
      description: "Page of memory stores",
    }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const query = input.query

      let offset = 0
      if (query.cursor) {
        const decoded = decodeMemoryStoreOffsetCursor(query.cursor)
        if (decoded === null) return yield* new BadRequestError({ message: "Invalid `cursor` value." })
        offset = decoded
      }

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const page = yield* listMemoryStoresUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        options: { sortBy: query.sort, sortDirection: query.direction, limit: query.limit, offset },
      })

      return {
        status: 200,
        body: {
          items: page.items.map((store) => toMemoryStoreResponse(store)),
          nextCursor: page.hasMore ? encodeMemoryStoreOffsetCursor(offset + page.items.length) : null,
          hasMore: page.hasMore,
        },
      } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const getMemoryStore = memoryEndpoint({
  route: createRoute({
    method: "get",
    path: "/store",
    name: "getMemoryStore",
    tags: ["Memory"],
    group: "memory",
    sdkMethod: "getStore",
    summary: "Get memory store snapshot",
    description:
      "Returns the store's current records (ids, token counts, last-updated) as a snapshot. Pass `at` (ISO-8601) to reconstruct the store as of a past point in time. Record bodies are fetched separately via `getMemoryRecord`.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      query: z.object({
        storeId: storeIdQuery,
        at: z.iso
          .datetime()
          .optional()
          .describe("Reconstruct the store as of this ISO-8601 timestamp. Defaults to the current state."),
      }),
    },
    responses: typedResponses({ status: 200, schema: MemoryStoreSnapshotSchema, description: "Memory store snapshot" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const { storeId, at } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const snapshot = yield* reconstructSnapshotUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        storeId,
        ...(at ? { at: new Date(at) } : {}),
      })
      return { status: 200, body: toMemoryStoreSnapshotResponse(snapshot) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const getMemoryStoreDiff = memoryEndpoint({
  route: createRoute({
    method: "get",
    path: "/store/diff",
    name: "getMemoryStoreDiff",
    tags: ["Memory"],
    group: "memory",
    sdkMethod: "getStoreDiff",
    summary: "Diff a memory store between two points in time",
    description:
      "Returns a per-record diff of the store between two points in time — added, updated, and removed records with token deltas. `from` defaults to the empty state (everything counts as added); `to` defaults to the current state. Unchanged records are pruned.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      query: z.object({
        storeId: storeIdQuery,
        from: z.iso
          .datetime()
          .optional()
          .describe("Lower bound (inclusive) of the diff, ISO-8601. Defaults to the empty state."),
        to: z.iso
          .datetime()
          .optional()
          .describe("Upper bound (inclusive) of the diff, ISO-8601. Defaults to the current state."),
      }),
    },
    responses: typedResponses({ status: 200, schema: MemoryStoreDiffSchema, description: "Memory store diff" }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const { storeId, from, to } = input.query

      if (from && to && Date.parse(to) < Date.parse(from)) {
        return { status: 400, body: { error: "`to` must be greater than or equal to `from`." } } as const
      }

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const diff = yield* computeMemoryDiffUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        storeId,
        ...(from ? { from: new Date(from) } : {}),
        ...(to ? { to: new Date(to) } : {}),
      })
      return { status: 200, body: toMemoryStoreDiffResponse(diff) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const listMemoryStoreUsers = memoryEndpoint({
  route: createRoute({
    method: "get",
    path: "/store/users",
    name: "listMemoryStoreUsers",
    tags: ["Memory"],
    group: "memory",
    sdkMethod: "listStoreUsers",
    summary: "List users who accessed a memory store",
    description:
      "Returns the end-users who accessed the store (reads and writes both count as access), most recent access first.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: z.object({ storeId: storeIdQuery }) },
    responses: typedResponses({ status: 200, schema: MemoryStoreUsersSchema, description: "Users of the store" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const { storeId } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const users = yield* listStoreUsersUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        storeId,
      })
      return { status: 200, body: toMemoryStoreUsersResponse(users) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const getMemoryRecord = memoryEndpoint({
  route: createRoute({
    method: "get",
    path: "/record",
    name: "getMemoryRecord",
    tags: ["Memory"],
    group: "memory",
    sdkMethod: "getRecord",
    summary: "Get a memory record",
    description:
      "Returns one record's current body plus its mutating version history (newest first), each version carrying the authoring span/trace/session/user and per-version token deltas.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: z.object({ storeId: storeIdQuery, recordId: recordIdQuery }) },
    responses: typedResponses({ status: 200, schema: MemoryRecordDetailSchema, description: "Memory record detail" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const { storeId, recordId } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const history = yield* computeRecordHistoryUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        storeId,
        recordId,
      })
      return { status: 200, body: toMemoryRecordDetailResponse(history) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const getMemoryRecordChange = memoryEndpoint({
  route: createRoute({
    method: "get",
    path: "/record/change",
    name: "getMemoryRecordChange",
    tags: ["Memory"],
    group: "memory",
    sdkMethod: "getRecordChange",
    summary: "Diff a single memory record change",
    description:
      "Returns the before/after bodies for one change — the version authored by `spanId` against its predecessor in the record's mutating chain. Returns 404 when the span is not a recorded change of the record.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      query: z.object({
        storeId: storeIdQuery,
        recordId: recordIdQuery,
        spanId: spanIdSchema.describe("Span that authored the change (the `after` side)."),
      }),
    },
    responses: typedResponses({
      status: 200,
      schema: MemoryRecordChangeDiffSchema,
      description: "Memory record change diff",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const { storeId, recordId, spanId } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const diff = yield* computeRecordChangeDiffUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        storeId,
        recordId,
        spanId: SpanId(spanId),
      })
      return { status: 200, body: toMemoryRecordChangeDiffResponse(diff) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const listMemoryRecordReads = memoryEndpoint({
  route: createRoute({
    method: "get",
    path: "/record/reads",
    name: "listMemoryRecordReads",
    tags: ["Memory"],
    group: "memory",
    sdkMethod: "listRecordReads",
    summary: "List reads of a memory record",
    description:
      "Returns the retrieval (`search_memory`) events for one record, newest first and capped, each with the query text (when captured), tokens returned, and the accessing span/trace/session/user.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      query: z.object({
        storeId: storeIdQuery,
        recordId: recordIdQuery,
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of read events to return. Capped at 200."),
      }),
    },
    responses: typedResponses({ status: 200, schema: MemoryRecordReadsSchema, description: "Reads of the record" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const { storeId, recordId, limit } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const events = yield* readRecordReadsUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        storeId,
        recordId,
        ...(limit === undefined ? {} : { limit }),
      })
      return { status: 200, body: toMemoryRecordReadsResponse(events) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const listMemoryRecordUsers = memoryEndpoint({
  route: createRoute({
    method: "get",
    path: "/record/users",
    name: "listMemoryRecordUsers",
    tags: ["Memory"],
    group: "memory",
    sdkMethod: "listRecordUsers",
    summary: "List users who accessed a memory record",
    description:
      "Returns the end-users who accessed one record with per-user read and write counts, most recent access first.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: z.object({ storeId: storeIdQuery, recordId: recordIdQuery }) },
    responses: typedResponses({ status: 200, schema: MemoryRecordUsersSchema, description: "Users of the record" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const { storeId, recordId } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const users = yield* listRecordUsersUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        storeId,
        recordId,
      })
      return { status: 200, body: toMemoryRecordUsersResponse(users) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

export const memoryModule: OperationModule = {
  path: memoryPath,
  operations: [
    listMemoryStores,
    getMemoryStore,
    getMemoryStoreDiff,
    listMemoryStoreUsers,
    getMemoryRecord,
    getMemoryRecordChange,
    listMemoryRecordReads,
    listMemoryRecordUsers,
  ],
}
