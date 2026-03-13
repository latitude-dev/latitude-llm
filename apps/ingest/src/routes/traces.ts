import { OrganizationId, ProjectId, putInDisk } from "@domain/shared"
import type { OtlpExportTraceServiceRequest } from "@domain/spans"
import { Effect } from "effect"
import type { Hono } from "hono"
import { getSpanIngestionQueue, getStorageDisk } from "../clients.ts"
import { authMiddleware } from "../middleware/auth.ts"
import { projectMiddleware } from "../middleware/project.ts"
import { decodeOtlpProtobuf } from "../otlp/proto.ts"
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

    if (!request.resourceSpans?.length) {
      return c.json({})
    }

    const organizationId = c.get("organizationId")
    const projectId = c.get("projectId")
    const apiKeyId = c.get("apiKeyId")
    const ingestedAt = new Date().toISOString()

    const payload = JSON.stringify({ request, context: { organizationId, projectId, apiKeyId }, ingestedAt })

    const disk = getStorageDisk()
    const storageKey = await Effect.runPromise(
      putInDisk(disk, {
        namespace: "ingest",
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        content: payload,
      }),
    )

    const queue = getSpanIngestionQueue()
    await queue.add(
      "process-spans",
      { storageKey },
      {
        jobId: storageKey,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    )

    return c.json({})
  })
}
