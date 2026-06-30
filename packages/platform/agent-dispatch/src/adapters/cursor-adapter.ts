import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"

export const createCursorAdapter = (): AgentDispatchAdapter => ({
  kind: "cursor",
  dispatch: ({ idempotencyKey, prompt, config, credential }) =>
    Effect.gen(function* () {
      const apiKey = credential.cursorApiKey
      if (!apiKey) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: "missing cursor api key" }))
      }

      const target = config as { repoUrl: string; startingRef: string; environmentName?: string }
      const body = {
        agentId: idempotencyKey,
        prompt: { text: prompt },
        repos: [{ url: target.repoUrl, startingRef: target.startingRef }],
        autoCreatePR: true,
        mode: "agent",
        ...(target.environmentName
          ? { env: { type: "cloud", name: target.environmentName } }
          : { env: { type: "cloud" } }),
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch("https://api.cursor.com/v1/agents", {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }),
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

      if (response.status === 409) {
        const json = yield* Effect.tryPromise(() => response.json()).pipe(Effect.orElseSucceed(() => ({})))
        const agent = (json as { agent?: { id?: string; url?: string }; run?: { id?: string } }).agent
        const run = (json as { run?: { id?: string } }).run
        return {
          status: "accepted" as const,
          ...(agent?.id !== undefined ? { externalAgentId: agent.id } : {}),
          ...(run?.id !== undefined ? { externalRunId: run.id } : {}),
          ...(agent?.url !== undefined ? { deepLinkUrl: agent.url } : {}),
        }
      }

      if (response.status === 401 || response.status === 403) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "auth", cause: response.status }))
      }
      if (response.status === 429) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "rate_limited", cause: response.status }))
      }
      if (response.status >= 500) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "transport", cause: response.status }))
      }
      if (response.status >= 400) {
        const detail = yield* Effect.tryPromise(() => response.text()).pipe(Effect.orElseSucceed(() => ""))
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: detail || response.status }))
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ agent?: { id?: string; url?: string }; run?: { id?: string } }>,
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

      return {
        status: "accepted" as const,
        ...(json.agent?.id !== undefined ? { externalAgentId: json.agent.id } : {}),
        ...(json.run?.id !== undefined ? { externalRunId: json.run.id } : {}),
        ...(json.agent?.url !== undefined ? { deepLinkUrl: json.agent.url } : {}),
      }
    }),
})
