import type { MiddlewareHandler } from "hono"

/**
 * Middleware that normalizes OpenAPIHono's validation error responses
 * into the standard `{ error: string }` shape used by the rest of the API.
 *
 * OpenAPIHono returns `{ success: false, error: { name: "ZodError", message } }`
 * when request validation fails. This middleware rewrites those responses
 * so clients always see a consistent error format.
 */
export const validationErrorMiddleware: MiddlewareHandler = async (c, next) => {
  await next()

  if (c.res.status !== 400) return

  const contentType = c.res.headers.get("content-type")
  if (!contentType?.includes("application/json")) return

  const body = await c.res.clone().json()

  if (body?.success === false && body?.error?.name === "ZodError" && typeof body.error.message === "string") {
    const parsed = JSON.parse(body.error.message)
    const message = Array.isArray(parsed)
      ? parsed.map((issue: { message?: string }) => issue.message ?? "Unknown error").join(", ")
      : body.error.message

    c.res = c.json({ error: message }, 400)
  }
}
