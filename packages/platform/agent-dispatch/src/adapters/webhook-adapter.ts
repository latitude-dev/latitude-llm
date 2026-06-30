import { createHmac } from "node:crypto"
import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"

const signPayload = (secret: string, body: string): string => createHmac("sha256", secret).update(body).digest("hex")

export const createWebhookAdapter = (): AgentDispatchAdapter => ({
  kind: "webhook",
  dispatch: ({ idempotencyKey, prompt, context, config, credential }) =>
    Effect.gen(function* () {
      const target = config as { webhookUrl: string }
      const secret = credential.webhookSecret
      if (!secret) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: "missing webhook secret" }))
      }

      const body = JSON.stringify({ trigger: context.trigger, context, prompt })
      const signature = signPayload(secret, body)

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(target.webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Latitude-Signature": `sha256=${signature}`,
              "X-Latitude-Delivery": idempotencyKey,
            },
            body,
          }),
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

      if (response.status === 401 || response.status === 403) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "auth", cause: response.status }))
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After")
        return yield* Effect.fail(
          new DispatchAdapterError({
            reason: "rate_limited",
            ...(retryAfter ? { retryAfterSec: Number(retryAfter) } : {}),
            cause: response.status,
          }),
        )
      }
      if (response.status >= 500) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "transport", cause: response.status }))
      }
      if (response.status >= 400) {
        const detail = yield* Effect.tryPromise(() => response.text()).pipe(Effect.orElseSucceed(() => ""))
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: detail || response.status }))
      }

      return { status: "accepted" as const, deepLinkUrl: target.webhookUrl }
    }),
})
