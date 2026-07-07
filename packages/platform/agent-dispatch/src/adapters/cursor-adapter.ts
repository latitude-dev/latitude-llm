import { createHash } from "node:crypto"
import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"

const buildCursorAgentId = (idempotencyKey: string): string => {
  const bytes = createHash("sha256").update(idempotencyKey).digest().subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `bc-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const createCursorAdapter = (): AgentDispatchAdapter => ({
  kind: "cursor",
  dispatch: ({ idempotencyKey, prompt, config, credential }) =>
    Effect.gen(function* () {
      const apiKey = credential.cursorApiKey
      if (!apiKey) {
        return yield* Effect.fail(
          new DispatchAdapterError({
            reason: "config",
            cause: "missing cursor api key",
          }),
        )
      }

      const target = config as {
        repoUrl: string
        startingRef?: string
        autoCreatePR?: boolean
      }
      const agentId = buildCursorAgentId(idempotencyKey)
      const body = {
        agentId,
        prompt: { text: prompt },
        repos: [{ url: target.repoUrl, ...(target.startingRef ? { startingRef: target.startingRef } : {}) }],
        autoCreatePR: target.autoCreatePR ?? true,
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch("https://api.cursor.com/v1/agents", {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${apiKey}:`)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }),
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

      if (response.status === 409) {
        const json = yield* Effect.tryPromise(() => response.json()).pipe(Effect.orElseSucceed(() => ({})))
        const responseBody = json as {
          id?: string
          agent?: { id?: string; url?: string }
          run?: { id?: string }
          target?: { url?: string }
        }
        return {
          status: "accepted" as const,
          ...(responseBody.id !== undefined
            ? { externalAgentId: responseBody.id }
            : responseBody.agent?.id !== undefined
              ? { externalAgentId: responseBody.agent.id }
              : { externalAgentId: agentId }),
          ...(responseBody.run?.id !== undefined ? { externalRunId: responseBody.run.id } : {}),
          ...(responseBody.target?.url !== undefined
            ? { deepLinkUrl: responseBody.target.url }
            : responseBody.agent?.url !== undefined
              ? { deepLinkUrl: responseBody.agent.url }
              : { deepLinkUrl: `https://cursor.com/agents/${agentId}` }),
        }
      }

      if (response.status === 401 || response.status === 403) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "auth", cause: response.status }))
      }
      if (response.status === 429) {
        return yield* Effect.fail(
          new DispatchAdapterError({
            reason: "rate_limited",
            cause: response.status,
          }),
        )
      }
      if (response.status >= 500) {
        return yield* Effect.fail(
          new DispatchAdapterError({
            reason: "transport",
            cause: response.status,
          }),
        )
      }
      if (response.status >= 400) {
        const detail = yield* Effect.tryPromise(() => response.text()).pipe(Effect.orElseSucceed(() => ""))
        return yield* Effect.fail(
          new DispatchAdapterError({
            reason: "config",
            cause: detail || response.status,
          }),
        )
      }

      const json = yield* Effect.tryPromise({
        try: () =>
          response.json() as Promise<{
            id?: string
            agent?: { id?: string; url?: string }
            run?: { id?: string }
            target?: { url?: string }
          }>,
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

      return {
        status: "accepted" as const,
        ...(json.id !== undefined
          ? { externalAgentId: json.id }
          : json.agent?.id !== undefined
            ? { externalAgentId: json.agent.id }
            : {}),
        ...(json.run?.id !== undefined ? { externalRunId: json.run.id } : {}),
        ...(json.target?.url !== undefined
          ? { deepLinkUrl: json.target.url }
          : json.agent?.url !== undefined
            ? { deepLinkUrl: json.agent.url }
            : {}),
      }
    }),
})
