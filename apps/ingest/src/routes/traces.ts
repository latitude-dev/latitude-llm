import { OrganizationId, ProjectId } from "@domain/shared"
import { ingestSpansUseCase } from "@domain/spans"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { StorageDiskLive } from "@platform/storage-object"
import { Effect } from "effect"
import type { Hono } from "hono"
import { getQueuePublisher, getStorageDisk } from "../clients.ts"
import { authMiddleware } from "../middleware/auth.ts"
import { projectMiddleware } from "../middleware/project.ts"
import type { IngestEnv } from "../types.ts"

interface TracesRouteContext {
  app: Hono<IngestEnv>
}

export const registerTracesRoute = ({ app }: TracesRouteContext) => {
  app.post("/v1/traces", authMiddleware, projectMiddleware, async (c) => {
    const contentType = c.req.header("Content-Type") ?? "application/json"
    const body = await c.req.arrayBuffer()
    if (!body.byteLength) return c.json({}, 202)

    const disk = getStorageDisk()
    const publisher = await getQueuePublisher()

    await Effect.runPromise(
      ingestSpansUseCase({
        organizationId: OrganizationId(c.get("organizationId")),
        projectId: ProjectId(c.get("projectId")),
        apiKeyId: c.get("apiKeyId"),
        payload: new Uint8Array(body),
        contentType,
      }).pipe(Effect.provide(StorageDiskLive(disk)), Effect.provide(QueuePublisherLive(publisher))),
    )

    return c.json({}, 202)
  })
}
