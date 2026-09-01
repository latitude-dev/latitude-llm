import type { Context } from "hono"

/**
 * The client address as the closest trusted proxy saw it: the **last**
 * `X-Forwarded-For` hop, not the first.
 *
 * `X-Forwarded-For` is append-only and anything to the left of the final entry
 * was supplied by the caller. Our public ALB (and any self-host reverse proxy)
 * appends the address it accepted the connection from without stripping what
 * arrived, so `1.2.3.4` sent by a client becomes `1.2.3.4, <real client>`.
 * Reading the first hop would therefore let a caller name any address it likes,
 * which is exactly what the partner IP allowlist must not permit.
 *
 * This assumes a single trusted proxy in front of the app, which is the
 * deployment topology (`infra/lib/alb.ts`) and the documented self-host one.
 * Returns `undefined` when the header is absent — a direct connection, i.e.
 * local development.
 */
export const trustedClientIp = (c: Context): string | undefined => {
  const hops = c.req.header("x-forwarded-for")?.split(",")
  return hops?.[hops.length - 1]?.trim() || undefined
}
