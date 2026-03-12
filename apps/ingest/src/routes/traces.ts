import type { OtlpExportTraceServiceRequest } from "@domain/spans"
import { decodeOtlpProtobuf, validateOtlpCompliance } from "@domain/spans"
import { Topics } from "@platform/queue-redpanda"
import { createLogger } from "@repo/observability"
import type { Hono } from "hono"
import { getSpanIngestionProducer } from "../clients.ts"
import { authMiddleware } from "../middleware/auth.ts"
import { projectMiddleware } from "../middleware/project.ts"
import type { IngestEnv } from "../types.ts"

const logger = createLogger("ingest:traces")

function decodeRequest(body: ArrayBuffer, contentType: string): OtlpExportTraceServiceRequest | null {
  try {
    if (contentType.includes("application/x-protobuf")) {
      return decodeOtlpProtobuf(new Uint8Array(body))
    }
    const text = new TextDecoder().decode(body)
    return JSON.parse(text) as OtlpExportTraceServiceRequest
  } catch {
    return null
  }
}

interface TracesRouteContext {
  app: Hono<IngestEnv>
}

export const registerTracesRoute = ({ app }: TracesRouteContext) => {
  app.post("/v1/traces", authMiddleware, projectMiddleware, async (c) => {
    const contentType = c.req.header("Content-Type") ?? "application/json"
    const body = await c.req.arrayBuffer()
    if (!body.byteLength) return c.json({}, 202)

    const request = decodeRequest(body, contentType)
    if (!request) {
      return c.json({ error: "Failed to decode trace payload" }, 400)
    }

    const validationError = validateOtlpCompliance(request)
    if (validationError) {
      return c.json({ error: validationError }, 400)
    }

    const organizationId = c.get("organizationId")
    const projectId = c.get("projectId")
    const apiKeyId = c.get("apiKeyId")

    const producer = await getSpanIngestionProducer().catch((error) => {
      logger.error(`Failed to get span ingestion producer: ${error}`)
      return undefined
    })
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
        .catch((error) => {
          logger.error(`Failed to send span ingestion message: ${error}`)
        })
    }

    return c.json({}, 202)
  })
}
