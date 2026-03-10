import { OpenAPIHono } from "@hono/zod-openapi"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import { createSignUpIpRateLimiter } from "../middleware/rate-limiter.ts"

const CLI_SESSION_TTL_SECONDS = 600 // 10 minutes
const getCliSessionKey = (token: string) => `cli:session:${token}`

interface CliSessionPending {
  readonly status: "pending"
}

interface CliSessionAuthenticated {
  readonly status: "authenticated"
  readonly token: string
  readonly organizationId: string
}

type CliSession = CliSessionPending | CliSessionAuthenticated

const isCliSession = (value: unknown): value is CliSession => {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  if (obj.status === "pending") return true
  if (obj.status === "authenticated") {
    return typeof obj.token === "string" && typeof obj.organizationId === "string"
  }
  return false
}

const POLL_MAX_REQUESTS = 60 // 60 polls per 10-minute window — matches session TTL
const POLL_WINDOW_SECONDS = 600

export const createCliAuthRoutes = () => {
  const app = new OpenAPIHono()
  const initRateLimiter = createSignUpIpRateLimiter()

  app.use("/initiate", initRateLimiter)
  app.use("/poll/:sessionToken", async (c, next) => {
    const redis = c.get("redis")
    const ip = (c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown").split(",")[0].trim()
    const key = `ratelimit:cli:poll:${ip}`
    const pipeline = redis.pipeline()
    pipeline.incr(key)
    pipeline.ttl(key)
    const results = await pipeline.exec()
    if (results) {
      const count = typeof results[0]?.[1] === "number" ? results[0][1] : 0
      const ttl = typeof results[1]?.[1] === "number" ? results[1][1] : -1
      if (count === 1 || ttl === -1) await redis.expire(key, POLL_WINDOW_SECONDS)
      if (count > POLL_MAX_REQUESTS) return c.json({ error: "Too many requests" }, 429)
    }
    await next()
  })

  // POST /initiate - start a CLI auth session
  app.post("/initiate", async (c) => {
    const redis = c.get("redis")
    const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))

    const sessionToken = crypto.randomUUID()
    const session: CliSessionPending = { status: "pending" }

    await redis.setex(getCliSessionKey(sessionToken), CLI_SESSION_TTL_SECONDS, JSON.stringify(session))

    const loginUrl = `${webUrl}/auth/cli?session=${sessionToken}`

    return c.json({ sessionToken, loginUrl }, 201)
  })

  // GET /poll/:sessionToken - poll for CLI auth completion
  app.get("/poll/:sessionToken", async (c) => {
    const redis = c.get("redis")
    const sessionToken = c.req.param("sessionToken")

    const raw = await redis.get(getCliSessionKey(sessionToken))

    if (!raw) {
      return c.json({ error: "Session not found or expired" }, 404)
    }

    let session: CliSession
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isCliSession(parsed)) {
        return c.json({ error: "Invalid session data" }, 500)
      }
      session = parsed
    } catch {
      return c.json({ error: "Invalid session data" }, 500)
    }

    if (session.status === "pending") {
      return c.json({ status: "pending" as const }, 202)
    }

    // Authenticated — delete key (one-time use) and return credentials
    await redis.del(getCliSessionKey(sessionToken))

    return c.json({
      status: "authenticated" as const,
      token: session.token,
      organizationId: session.organizationId,
    })
  })

  return app
}
