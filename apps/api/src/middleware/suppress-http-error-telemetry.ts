import { isHttpError } from "@repo/utils"
import { createMiddleware } from "hono/factory"

// Must be registered after `app.use(otel())` — clears `c.error` before
// `@hono/otel` reads it to call `recordException`.
export const suppressHttpErrorTelemetry = createMiddleware(async (c, next) => {
  await next()
  if (c.error && isHttpError(c.error) && c.error.httpStatus < 500) {
    c.error = undefined
  }
})
