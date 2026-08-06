import { createHmac } from "node:crypto"
import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"
import { z } from "zod"
import { type HostLookup, resolvePublicWebhookUrl } from "../host-guard.ts"

const signPayload = (secret: string, body: string): string => createHmac("sha256", secret).update(body).digest("hex")

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === "http:" || protocol === "https:"
  })

const webhookAcknowledgementSchema = z.object({
  externalAgentId: z.string().trim().min(1).optional().catch(undefined),
  externalRunId: z.string().trim().min(1).optional().catch(undefined),
  deepLinkUrl: httpUrlSchema.optional().catch(undefined),
})

const parseWebhookAcknowledgement = (value: unknown) => {
  const parsed = webhookAcknowledgementSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}

export const createWebhookAdapter = (lookupHost?: HostLookup): AgentDispatchAdapter => ({
  kind: "webhook",
  dispatch: ({ idempotencyKey, prompt, context, config, credential }) =>
    Effect.gen(function* () {
      const target = config as { webhookUrl: string }
      const secret = credential.webhookSecret
      if (!secret) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: "missing webhook secret" }))
      }

      const url = yield* Effect.tryPromise({
        try: () => resolvePublicWebhookUrl(target.webhookUrl, lookupHost),
        catch: (cause) =>
          new DispatchAdapterError({
            reason: cause instanceof Error && cause.message.startsWith("webhook_") ? "config" : "transport",
            cause,
          }),
      })

      const body = JSON.stringify({ trigger: context.trigger, context, prompt })
      const signature = signPayload(secret, body)

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            method: "POST",
            redirect: "error",
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

      const responseBody = yield* Effect.tryPromise(() => response.json() as Promise<unknown>).pipe(
        Effect.orElseSucceed(() => undefined),
      )
      const acknowledgement = parseWebhookAcknowledgement(responseBody)

      return {
        status: "accepted" as const,
        ...(acknowledgement.externalAgentId !== undefined ? { externalAgentId: acknowledgement.externalAgentId } : {}),
        ...(acknowledgement.externalRunId !== undefined ? { externalRunId: acknowledgement.externalRunId } : {}),
        deepLinkUrl: acknowledgement.deepLinkUrl ?? target.webhookUrl,
      }
    }),
})
