import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"

export const createClaudeRoutineAdapter = (): AgentDispatchAdapter => ({
  kind: "claude_code",
  dispatch: ({ prompt, config, credential }) =>
    Effect.gen(function* () {
      const token = credential.claudeRoutineToken
      if (!token) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: "missing claude routine token" }))
      }

      const target = config as { routineTriggerId: string }
      const url = `https://api.anthropic.com/v1/claude_code/routines/${target.routineTriggerId}/fire`

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "anthropic-beta": "experimental-cc-routine-2026-04-01",
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: prompt }),
          }),
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

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
        try: () => response.json() as Promise<{ session_id?: string; url?: string }>,
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

      return {
        status: "accepted" as const,
        ...(json.session_id !== undefined ? { externalAgentId: json.session_id } : {}),
        ...(json.url !== undefined ? { deepLinkUrl: json.url } : {}),
      }
    }),
})
