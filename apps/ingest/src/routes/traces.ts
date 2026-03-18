import type { QueueMessage } from "@domain/queue"
import { OrganizationId, ProjectId, putInDisk } from "@domain/shared"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import type { Hono } from "hono"
import { getQueuePublisher, getStorageDisk } from "../clients.ts"
import { authMiddleware } from "../middleware/auth.ts"
import { projectMiddleware } from "../middleware/project.ts"
import type { IngestEnv } from "../types.ts"

const logger = createLogger("ingest:traces")

interface TracesRouteContext {
  app: Hono<IngestEnv>
}

export const registerTracesRoute = ({ app }: TracesRouteContext) => {
  app.post("/v1/traces", authMiddleware, projectMiddleware, async (c) => {
    const contentType = c.req.header("Content-Type") ?? "application/json"
    const body = await c.req.arrayBuffer()
    if (!body.byteLength) return c.json({}, 202)

    const organizationId = c.get("organizationId")
    const projectId = c.get("projectId")
    const apiKeyId = c.get("apiKeyId")

    const publisher = await getQueuePublisher().catch((error: unknown) => {
      logger.error(`Failed to get queue publisher: ${error}`)
      return undefined
    })

    if (publisher) {
      const disk = getStorageDisk()

      const fileKey = await Effect.runPromise(
        putInDisk(disk, {
          namespace: "ingest",
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(projectId),
          content: new Uint8Array(body),
          extension: contentType.includes("protobuf") ? "protobuf" : "json",
        }),
      ).catch((error: unknown) => {
        logger.error(`Failed to store ingest payload: ${error}`)
        return undefined
      })

      if (fileKey) {
        const message: QueueMessage = {
          body: new TextEncoder().encode(fileKey),
          key: organizationId,
          headers: new Map([
            ["content-type", contentType],
            ["organization-id", organizationId],
            ["project-id", projectId],
            ["api-key-id", apiKeyId],
            ["ingested-at", new Date().toISOString()],
          ]),
        }

        await Effect.runPromise(publisher.publish("span-ingestion", message)).catch((error: unknown) => {
          logger.error(`Failed to publish span ingestion message: ${error}`)
        })
      }
    }

    return c.json({}, 202)
  })
}
