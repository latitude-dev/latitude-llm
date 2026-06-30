import type { AgentDispatchAdapter } from "@domain/agent-dispatch"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"

const buildIssueMutation = (input: {
  readonly teamId: string
  readonly title: string
  readonly description: string
  readonly labelIds?: readonly string[]
  readonly assigneeId?: string
}) => {
  const labelPart = input.labelIds?.length ? `, labelIds: [${input.labelIds.map((id) => `"${id}"`).join(", ")}]` : ""
  const assigneePart = input.assigneeId ? `, assigneeId: "${input.assigneeId}"` : ""
  return `mutation { issueCreate(input: { teamId: "${input.teamId}", title: ${JSON.stringify(input.title)}, description: ${JSON.stringify(input.description)}${labelPart}${assigneePart} }) { success issue { id url identifier } } }`
}

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
              query: buildIssueMutation({
                teamId: target.teamId,
                title,
                description,
                ...(target.labelIds !== undefined ? { labelIds: target.labelIds } : {}),
                ...(target.assigneeId !== undefined ? { assigneeId: target.assigneeId } : {}),
              }),
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
