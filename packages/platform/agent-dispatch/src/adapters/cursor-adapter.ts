import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"

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
      const body = {
        agentId: idempotencyKey,
        prompt: { text: prompt },
        source: {
          repository: target.repoUrl,
          ...(target.startingRef ? { ref: target.startingRef } : {}),
        },
        target: {
          autoCreatePr: target.autoCreatePR ?? true,
        },
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch("https://api.cursor.com/v0/agents", {
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
              : {}),
          ...(responseBody.run?.id !== undefined ? { externalRunId: responseBody.run.id } : {}),
          ...(responseBody.target?.url !== undefined
            ? { deepLinkUrl: responseBody.target.url }
            : responseBody.agent?.url !== undefined
              ? { deepLinkUrl: responseBody.agent.url }
              : {}),
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
