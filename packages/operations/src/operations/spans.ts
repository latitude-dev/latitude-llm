import { ProjectRepository } from "@domain/projects"
import { OrganizationId, ProjectId, SpanId } from "@domain/shared"
import {
  type SpanListCursor,
  type SpanListOrderDirection,
  type SpanListOrderField,
  SpanRepository,
} from "@domain/spans"
import { createRoute, z } from "@hono/zod-openapi"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { SpanSchema, toSpanResponse } from "../openapi/entities/span.ts"
import {
  FilterSetSchema,
  jsonBody,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const spansPath = "/projects/:projectSlug/spans"

const spanEndpoint = defineOperation<OrganizationScopedEnv>(spansPath)

// Opaque keyset cursor — encodes the last row's `(field, direction, sortValue,
// spanId)` so the next page resumes strictly after it. Keyset (not offset) so a
// span landing mid-pagination can't shift the window and skip/duplicate rows.
const ORDER_FIELDS: readonly SpanListOrderField[] = ["startTime", "duration", "cost"]
const ORDER_DIRECTIONS: readonly SpanListOrderDirection[] = ["asc", "desc"]

const encodeSpanListCursor = (cursor: SpanListCursor): string =>
  Buffer.from(
    JSON.stringify({ f: cursor.field, d: cursor.direction, v: cursor.sortValue, s: cursor.spanId }),
    "utf8",
  ).toString("base64url")

const decodeSpanListCursor = (raw: string): SpanListCursor | null => {
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      f?: unknown
      d?: unknown
      v?: unknown
      s?: unknown
    }
    if (!ORDER_FIELDS.includes(p.f as SpanListOrderField)) return null
    if (!ORDER_DIRECTIONS.includes(p.d as SpanListOrderDirection)) return null
    if (typeof p.v !== "string" || typeof p.s !== "string") return null
    return {
      field: p.f as SpanListOrderField,
      direction: p.d as SpanListOrderDirection,
      sortValue: p.v,
      spanId: SpanId(p.s),
    }
  } catch {
    return null
  }
}

const QuerySpansBodySchema = z
  .object({
    filters: FilterSetSchema.optional().describe(
      "Row-local span filter set (same DSL as `listTraces`) over span fields — `operation`, `toolName`, `model`, `provider`, `sessionId`, `traceId`, `tags`, `status` (`error`/`ok`/`unset`), `duration`, `cost`, `tokensInput`/`tokensOutput`.",
    ),
    orderBy: z
      .object({
        field: z.enum(["startTime", "duration", "cost"]).default("startTime").describe("Sort key."),
        direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
      })
      .optional()
      .describe(
        "Sort order. Defaults to newest first (`startTime` desc); use `duration`/`cost` desc for top-N slowest/costliest.",
      ),
    range: z
      .object({
        fromIso: z.iso
          .datetime()
          .openapi({ example: "2026-06-23T00:00:00Z" })
          .describe("Inclusive lower bound (ISO-8601)."),
        toIso: z.iso
          .datetime()
          .openapi({ example: "2026-06-30T00:00:00Z" })
          .describe("Upper bound (ISO-8601). Must be after `fromIso`."),
      })
      .optional()
      .describe("Restrict to spans whose `startTime` falls in this window."),
    cursor: z
      .string()
      .optional()
      .describe("Opaque cursor from a previous response's `nextCursor`. Omit on the first page."),
    limit: z.number().int().min(1).max(200).default(50).describe("Page size. Defaults to 50; max 200."),
  })
  .openapi("QuerySpansBody")

const QuerySpansResponseSchema = z
  .object({
    items: z
      .array(SpanSchema)
      .describe(
        "Matching spans across traces, newest first. Rows exclude per-message LLM content — use a span point-lookup for the payload.",
      ),
    nextCursor: z.string().nullable().describe("Cursor for the next page, or `null` when there are no more spans."),
    hasMore: z.boolean().describe("Whether more spans match beyond this page."),
  })
  .openapi("QuerySpans")

// A cross-trace span list is a POST so `filters` is a typed object in the body
// (visible in the generated SDK/MCP schema) rather than a URL-encoded JSON string.
const querySpans = spanEndpoint({
  route: createRoute({
    method: "post",
    path: "/query",
    name: "querySpans",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Spans"],
    group: "spans",
    sdkMethod: "query",
    summary: "Query spans across traces",
    description:
      'Returns a cursor-paginated page of spans across all traces in the project matching `filters` (and an optional time `range`). The span-grain, row-level complement to `queryAnalytics` with `stream: "spans"` (which returns aggregates): use this to drill from an aggregate into the individual spans behind it — e.g. every failing `search_docs` tool span, or the slowest embedding calls.',
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(QuerySpansBodySchema) },
    responses: openApiResponses({ status: 200, schema: QuerySpansResponseSchema, description: "Page of spans" }),
  }),
  rateLimitTier: "high",
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const orderBy = body.orderBy ?? { field: "startTime" as const, direction: "desc" as const }

    let cursor: SpanListCursor | undefined
    if (body.cursor) {
      const decoded = decodeSpanListCursor(body.cursor)
      if (decoded === null) return c.json({ error: "Invalid `cursor` value." }, 400)
      // The cursor is pinned to the ordering it was minted under; replaying it
      // under a different `orderBy` would page incoherently.
      if (decoded.field !== orderBy.field || decoded.direction !== orderBy.direction) {
        return c.json({ error: "`cursor` does not match `orderBy`; restart pagination without the cursor." }, 400)
      }
      cursor = decoded
    }
    if (body.range && new Date(body.range.fromIso).getTime() >= new Date(body.range.toIso).getTime()) {
      return c.json({ error: "`range.fromIso` must be strictly before `range.toIso`." }, 400)
    }

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const spanRepo = yield* SpanRepository
        return yield* spanRepo.listByProjectId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          options: {
            limit: body.limit,
            orderBy,
            ...(cursor ? { cursor } : {}),
            ...(body.filters ? { filters: body.filters } : {}),
            ...(body.range
              ? { startTimeFrom: new Date(body.range.fromIso), startTimeTo: new Date(body.range.toIso) }
              : {}),
          },
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(SpanRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(
      {
        items: page.items.map(toSpanResponse),
        nextCursor: page.nextCursor ? encodeSpanListCursor(page.nextCursor) : null,
        hasMore: page.nextCursor !== null,
      },
      200,
    )
  },
})

export const spansModule: OperationModule = {
  path: spansPath,
  operations: [querySpans],
}
