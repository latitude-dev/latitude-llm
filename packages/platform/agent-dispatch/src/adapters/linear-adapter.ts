import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"

const ISSUE_CREATE_MUTATION = `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id url identifier }
  }
}`

export const createLinearAdapter = (): AgentDispatchAdapter => ({
  kind: "linear",
  dispatch: ({ prompt, context, config, credential }) =>
    Effect.gen(function* () {
      const apiKey = credential.linearApiKey
      if (!apiKey) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: "missing linear api key" }))
      }

      const target = config as { teamId: string; labelIds?: string[]; assigneeId?: string }
      const title = context.signal
        ? `[Latitude] ${context.signal.name} — ${context.trigger}`
        : `[Latitude] Incident — ${context.trigger}`
      const description = `${prompt}\n\n${context.deepLinkUrl}`

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch("https://api.linear.app/graphql", {
            method: "POST",
            headers: {
              Authorization: apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: ISSUE_CREATE_MUTATION,
              variables: {
                input: {
                  teamId: target.teamId,
                  title,
                  description,
                  ...(target.labelIds?.length ? { labelIds: [...target.labelIds] } : {}),
                  ...(target.assigneeId !== undefined ? { assigneeId: target.assigneeId } : {}),
                },
              },
            }),
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

      const json = yield* Effect.tryPromise({
        try: () =>
          response.json() as Promise<{
            data?: { issueCreate?: { success?: boolean; issue?: { id?: string; url?: string } } }
            errors?: readonly { message?: string }[]
          }>,
        catch: (cause) => new DispatchAdapterError({ reason: "transport", cause }),
      })

      if (json.errors?.length) {
        return yield* Effect.fail(new DispatchAdapterError({ reason: "config", cause: json.errors[0]?.message }))
      }

      const issue = json.data?.issueCreate?.issue
      return {
        status: "accepted" as const,
        ...(issue?.id !== undefined ? { externalAgentId: issue.id } : {}),
        ...(issue?.url !== undefined ? { deepLinkUrl: issue.url } : {}),
      }
    }),
})
