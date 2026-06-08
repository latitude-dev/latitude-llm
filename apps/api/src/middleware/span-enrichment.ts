import { trace } from "@repo/observability"
import type { Context, MiddlewareHandler, Next } from "hono"

/**
 * Attaches tenant/user identity to the active OpenTelemetry span so it shows up
 * on Datadog Error Tracking issues. The `@hono/otel` middleware records request
 * exceptions on this same HTTP span, so any attribute set here becomes a
 * searchable facet on the resulting issue.
 *
 * Uses Datadog's reserved user keys (`usr.id`, `usr.email`) so they populate the
 * native user facet, plus a custom `organization.id` (Datadog has no built-in
 * org concept) and `auth.method` for filtering.
 *
 * Must run AFTER the auth middleware (so `c.get("auth")` is populated). Purely
 * best-effort: if there's no active span or no auth context it no-ops, and it
 * never throws — telemetry must not affect request handling.
 *
 * Note: on the `api-key` path `usr.id` is the synthetic `api-key:<keyId>`
 * principal and there is no email; `usr.email` is set only for `oauth` requests.
 */
export const createSpanEnrichmentMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth")
    const span = trace.getActiveSpan()

    if (auth && span) {
      span.setAttributes({
        "organization.id": auth.organizationId,
        "usr.id": auth.userId,
        "auth.method": auth.method,
      })
      if (auth.method === "oauth" && auth.email) {
        span.setAttribute("usr.email", auth.email)
      }
    }

    await next()
  }
}
