import { Topics } from "@platform/queue-redpanda"
import type { Hono } from "hono"
import { getSpanIngestionProducer } from "../clients.ts"
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

    const organizationId = c.get("organizationId")
    const projectId = c.get("projectId")
    const apiKeyId = c.get("apiKeyId")

    const producer = await getSpanIngestionProducer().catch(() => undefined)
    if (producer) {
      await producer
        .send({
          topic: Topics.spanIngestion,
          messages: [
            {
              key: organizationId,
              value: Buffer.from(body),
              headers: {
                "content-type": contentType,
                "organization-id": organizationId,
                "project-id": projectId,
                "api-key-id": apiKeyId,
                "ingested-at": new Date().toISOString(),
              },
            },
          ],
        })
        .catch(() => undefined)
    }

    return c.json({}, 202)
  })
}
