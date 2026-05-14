import type { MiddlewareHandler } from "hono"
import type { IngestEnv } from "../types.ts"

/**
 * Reads the optional `X-Latitude-Project` header and exposes it as the per-request default
 * project slug.
 *
 * Best-effort: this middleware does not validate the slug or hit Postgres. Per-span resolution
 * (and the OTLP `partial_success` accounting that follows from it) happens in the ingest use
 * case. When the header is missing, spans must carry a `latitude.project` attribute on the span
 * or its OTEL resource — otherwise they're rejected with `400` or counted as partial_success
 * rejections, depending on whether any span in the batch resolved.
 */
export const projectMiddleware: MiddlewareHandler<IngestEnv> = async (c, next) => {
  const projectSlug = c.req.header("X-Latitude-Project")
  if (projectSlug) {
    c.set("defaultProjectSlug", projectSlug)
  }
  await next()
}
