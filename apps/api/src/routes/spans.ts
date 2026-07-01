import { ProjectRepository } from "@domain/projects"
import { OrganizationId, ProjectId } from "@domain/shared"
import { SpanRepository } from "@domain/spans"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import { SpanSchema, toSpanResponse } from "../openapi/entities/span.ts"
import {
  FilterSetSchema,
  jsonBody,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

export const spansPath = "/projects/:projectSlug/spans"

const spansFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "spans",
    "x-fern-sdk-method-name": methodName,
  }) as const

const spanEndpoint = defineApiEndpoint<OrganizationScopedEnv>(spansPath)

// Opaque offset cursor — the underlying span read is offset-based; encoding the
// offset keeps the public shape (`{ items, nextCursor, hasMore }`) consistent
// with the rest of the surface.
const encodeOffsetCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url")

const decodeOffsetCursor = (raw: string): number | null => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown
    const offset = (parsed as { offset?: unknown })?.offset
    if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) return null
    return offset
  } catch {
    return null
  }
}

const QuerySpansBodySchema = z
  .object({
    filters: FilterSetSchema.optional().describe(
      "Row-local span filter set (same DSL as `listTraces`) over span fields — `operation`, `toolName`, `model`, `provider`, `sessionId`, `traceId`, `tags`, `duration`, `cost`, `tokensInput`/`tokensOutput`.",
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
    ...spansFernGroup("query"),
    summary: "Query spans across traces",
    description:
      'Returns a cursor-paginated page of spans across all traces in the project matching `filters` (and an optional time `range`). The span-grain, row-level complement to `queryAnalytics` with `stream: "spans"` (which returns aggregates): use this to drill from an aggregate into the individual spans behind it — e.g. every failing `search_docs` tool span, or the slowest embedding calls.',
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(QuerySpansBodySchema) },
    responses: openApiResponses({ status: 200, schema: QuerySpansResponseSchema, description: "Page of spans" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    let offset = 0
    if (body.cursor) {
      const decoded = decodeOffsetCursor(body.cursor)
      if (decoded === null) return c.json({ error: "Invalid `cursor` value." }, 400)
      offset = decoded
    }
    if (body.range && new Date(body.range.fromIso).getTime() >= new Date(body.range.toIso).getTime()) {
      return c.json({ error: "`range.fromIso` must be strictly before `range.toIso`." }, 400)
    }

    // Over-fetch one row to learn whether a next page exists without a count.
    const spans = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const spanRepo = yield* SpanRepository
        return yield* spanRepo.listByProjectId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          options: {
            limit: body.limit + 1,
            offset,
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

    const hasMore = spans.length > body.limit
    const items = hasMore ? spans.slice(0, body.limit) : spans
    return c.json(
      {
        items: items.map(toSpanResponse),
        nextCursor: hasMore ? encodeOffsetCursor(offset + body.limit) : null,
        hasMore,
      },
      200,
    )
  },
})

export const createSpansRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  querySpans.mountHttp(app, createTierRateLimiter("high"))
  return app
}
