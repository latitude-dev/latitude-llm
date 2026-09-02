import { createHmac } from "node:crypto"
import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"
import { z } from "zod"
import {
  type HostLookup,
  postPinnedHttps,
  resolvePublicWebhookTarget,
  WEBHOOK_RESPONSE_MAX_BYTES,
} from "../host-guard.ts"

const signPayload = (secret: string, body: string): string => createHmac("sha256", secret).update(body).digest("hex")

const WEBHOOK_ACK_READ_TIMEOUT_MS = 1_000
const HTTP_REDIRECT_STATUSES = [301, 302, 303, 307, 308] as const

const isHttpRedirect = (status: number): boolean => (HTTP_REDIRECT_STATUSES as readonly number[]).includes(status)

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === "http:" || protocol === "https:"
    } catch {
      return false
    }
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

const cancelReader = (reader: ReadableStreamDefaultReader<Uint8Array>): void => {
  try {
    void reader.cancel().catch(() => undefined)
  } catch {}
}

const cancelResponseBody = (response: { readonly body: ReadableStream<Uint8Array> | null }): void => {
  if (!response.body) return
  void response.body.cancel().catch(() => undefined)
}

const readWebhookAcknowledgement = (
  response: { readonly body: ReadableStream<Uint8Array> | null },
  signal: AbortSignal,
): Promise<unknown> => {
  if (!response.body) return Promise.resolve(undefined)

  const reader = response.body.getReader()
  return new Promise((resolve, reject) => {
    let settled = false
    let bytesRead = 0
    const chunks: Uint8Array[] = []

    const removeAbortListener = () => signal.removeEventListener("abort", onAbort)
    const fail = (cause: unknown) => {
      if (settled) return
      settled = true
      removeAbortListener()
      cancelReader(reader)
      reject(cause)
    }
    const onAbort = () => fail(new Error("webhook acknowledgement read interrupted"))

    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }

    void (async () => {
      try {
        while (!settled) {
          const { done, value } = await reader.read()
          if (done) {
            if (settled) return
            const payload = new Uint8Array(bytesRead)
            let offset = 0
            for (const chunk of chunks) {
              payload.set(chunk, offset)
              offset += chunk.byteLength
            }
            resolve(JSON.parse(new TextDecoder().decode(payload)))
            settled = true
            removeAbortListener()
            return
          }

          bytesRead += value.byteLength
          if (bytesRead > WEBHOOK_RESPONSE_MAX_BYTES) {
            fail(new Error("webhook acknowledgement body exceeded the size limit"))
            return
          }
          chunks.push(value)
        }
      } catch (cause) {
        fail(cause)
      } finally {
        try {
          reader.releaseLock()
        } catch {}
      }
    })()
  })
}

export const createWebhookAdapter = (
  lookupHost?: HostLookup,
  postHttps: typeof postPinnedHttps = postPinnedHttps,
): AgentDispatchAdapter => ({
  kind: "webhook",
  dispatch: ({ idempotencyKey, prompt, context, config, credential }) =>
    Effect.gen(function* () {
      const webhookTarget = config as { webhookUrl: string }
      const secret = credential.webhookSecret
      if (!secret) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: "missing webhook secret" }))
      }

      const pinnedTarget = yield* Effect.tryPromise({
        try: () => resolvePublicWebhookTarget(webhookTarget.webhookUrl, lookupHost),
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
          postHttps(pinnedTarget, {
            headers: {
              "Content-Type": "application/json",
              "X-Latitude-Signature": `sha256=${signature}`,
              "X-Latitude-Delivery": idempotencyKey,
            },
            body,
          }),
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

      if (isHttpRedirect(response.status)) {
        cancelResponseBody(response)
        return yield* Effect.fail(new DispatchAdapterError({ reason: "transport", cause: response.status }))
      }
      if (response.status === 401 || response.status === 403) {
        cancelResponseBody(response)
        return yield* Effect.fail(new DispatchAdapterError({ reason: "auth", cause: response.status }))
      }
      if (response.status === 429) {
        cancelResponseBody(response)
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
        cancelResponseBody(response)
        return yield* Effect.fail(new DispatchAdapterError({ reason: "transport", cause: response.status }))
      }
      if (response.status >= 400) {
        const detail = yield* Effect.tryPromise(() => response.text()).pipe(Effect.orElseSucceed(() => ""))
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: detail || response.status }))
      }

      const responseBody = yield* Effect.tryPromise((signal) => readWebhookAcknowledgement(response, signal)).pipe(
        Effect.timeoutOrElse({
          duration: WEBHOOK_ACK_READ_TIMEOUT_MS,
          orElse: () => Effect.succeed(undefined),
        }),
        Effect.orElseSucceed(() => undefined),
      )
      const acknowledgement = parseWebhookAcknowledgement(responseBody)

      return {
        status: "accepted" as const,
        ...(acknowledgement.externalAgentId !== undefined ? { externalAgentId: acknowledgement.externalAgentId } : {}),
        ...(acknowledgement.externalRunId !== undefined ? { externalRunId: acknowledgement.externalRunId } : {}),
        deepLinkUrl: acknowledgement.deepLinkUrl ?? webhookTarget.webhookUrl,
      }
    }),
})
