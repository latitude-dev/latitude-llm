import type { PublishOptions } from "@domain/queue"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { loadGithubConfig, verifyGithubSignature } from "@platform/github"
import { createLogger } from "@repo/observability"
import { Effect, Exit } from "effect"
import { createGlobalRateLimiter } from "../middleware/rate-limiter.ts"
import type { AppEnv } from "../types.ts"
import { routeGithubWebhook } from "./webhooks-github-extract.ts"

const logger = createLogger("webhooks-github")

/** GitHub delivers a merged-PR push and the `pull_request closed` event with no ordering guarantee; the delay lets the PR event win the race (5.9). */
const PUSH_GRACE_DELAY_MS = 2_500
const RETRY_BACKOFF_BASE_MS = 30_000
const MAX_ATTEMPTS = 5

/**
 * Inbound GitHub App webhook receiver. Mounted on `v1` before the auth wall,
 * like `bootstrap.ts` — it inherits the `v1.use("*")` context injector, so the
 * rate limiter and `queuePublisher` come from `c` (public URL:
 * `/v1/webhooks/github`). Verifies `X-Hub-Signature-256` over the raw body,
 * slim-extracts, enqueues to `github-events`, and 202s well inside GitHub's 10s
 * window. Deliberately DB-free — all processing is async (5.7).
 *
 * A plain `app.post` (not `app.openapi`) so the raw body is readable for HMAC
 * verification without Hono consuming it as validated JSON; the endpoint is
 * operational and stays out of the SDK either way.
 */
export const registerGithubRoute = ({ app }: { app: OpenAPIHono<AppEnv> }) => {
  app.use(
    "/webhooks/github",
    createGlobalRateLimiter({ key: "webhooks-github", maxRequests: 10_000, windowSeconds: 60 }),
  )

  app.post("/webhooks/github", async (c) => {
    const config = await Effect.runPromise(loadGithubConfig)
    if (!config) {
      return c.json({ error: "GitHub integration is not configured" }, 503)
    }

    const rawBody = await c.req.text()
    const verification = await Effect.runPromiseExit(
      verifyGithubSignature({
        secret: config.webhookSecret,
        signature: c.req.header("x-hub-signature-256"),
        body: rawBody,
      }),
    )
    if (Exit.isFailure(verification)) {
      return c.json({ error: "Invalid signature" }, 401)
    }

    const event = c.req.header("x-github-event") ?? ""
    const deliveryId = c.req.header("x-github-delivery") ?? ""

    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const route = routeGithubWebhook({ event, deliveryId, body: parsed })
    if (route.kind === "ping") return c.json({ ok: true }, 200)
    if (route.kind === "ignore") return c.body(null, 202)

    const queuePublisher = c.get("queuePublisher")
    const base: PublishOptions = {
      dedupeKey: `github:${deliveryId}`,
      attempts: MAX_ATTEMPTS,
      backoff: { type: "exponential", delayMs: RETRY_BACKOFF_BASE_MS },
    }

    const published = await Effect.runPromiseExit(
      route.kind === "pull-request"
        ? queuePublisher.publish("github-events", "pull-request", route.task, base)
        : route.kind === "push"
          ? queuePublisher.publish("github-events", "push", route.task, { ...base, delayMs: PUSH_GRACE_DELAY_MS })
          : queuePublisher.publish("github-events", "installation", route.task, base),
    )

    if (Exit.isFailure(published)) {
      logger.error("failed to enqueue github delivery", { deliveryId, event })
      return c.json({ error: "Failed to enqueue delivery" }, 500)
    }

    return c.body(null, 202)
  })
}
