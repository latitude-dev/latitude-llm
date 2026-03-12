import { OrganizationId } from "@domain/shared"
import { SpanRepository } from "@domain/spans"
import { ChSqlClientLive, SpanRepositoryLive } from "@platform/db-clickhouse"
import { Effect } from "effect"
import type { Hono } from "hono"
import { getClickhouseClient } from "../clients.ts"
import { authMiddleware } from "../middleware/auth.ts"
import { projectMiddleware } from "../middleware/project.ts"
import { decodeOtlpProtobuf } from "../otlp/proto.ts"
import { transformOtlpToSpans } from "../otlp/transform.ts"
import type { OtlpExportTraceServiceRequest } from "../otlp/types.ts"
import type { IngestEnv } from "../types.ts"

interface TracesRouteContext {
  app: Hono<IngestEnv>
}

export const registerTracesRoute = ({ app }: TracesRouteContext) => {
  app.post("/v1/traces", authMiddleware, projectMiddleware, async (c) => {
    const contentType = c.req.header("Content-Type") ?? "application/json"

    let request: OtlpExportTraceServiceRequest
    try {
      if (contentType.includes("application/x-protobuf")) {
        const body = await c.req.arrayBuffer()
        request = decodeOtlpProtobuf(new Uint8Array(body))
      } else {
        request = (await c.req.json()) as OtlpExportTraceServiceRequest
      }
    } catch {
      return c.json({ error: "Invalid OTLP payload" }, 400)
    }

    const spans = transformOtlpToSpans(request, {
      organizationId: c.get("organizationId"),
      projectId: c.get("projectId"),
      apiKeyId: c.get("apiKeyId"),
    })

    if (spans.length > 0) {
      const orgId = OrganizationId(c.get("organizationId"))
      await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* SpanRepository
          yield* repo.insert(spans)
        }).pipe(Effect.provide(SpanRepositoryLive), Effect.provide(ChSqlClientLive(getClickhouseClient(), orgId))),
      )
    }

    return c.json({})
  })
}
