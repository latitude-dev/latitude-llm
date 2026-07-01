import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { DispatchErrorCategory } from "../entities/agent-dispatch.ts"
import type { ResolvedDispatchTarget } from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchContext } from "../entities/agent-dispatch-context.ts"
import { DispatchAdapterError } from "../errors.ts"
import { AgentDispatchAdapters } from "../ports/agent-dispatch-adapter.ts"
import { AgentDispatchCredentialRepository, AgentDispatchRepository } from "../ports/repositories.ts"

export interface SendAgentDispatchInput {
  readonly configId: string
  readonly projectId: import("@domain/shared").ProjectId
  readonly integrationId: string
  readonly kind: import("../entities/agent-dispatch-config.ts").AgentDispatchKind
  readonly idempotencyKey: string
  readonly trigger: import("../entities/agent-dispatch-context.ts").AgentDispatchTrigger
  readonly sourceType: "signal" | "monitor"
  readonly sourceId: string
  readonly prompt: string
  readonly context: AgentDispatchContext
  readonly target: ResolvedDispatchTarget
}

export type SendAgentDispatchOutcome =
  | { readonly status: "dispatched"; readonly externalUrl?: string }
  | { readonly status: "skipped-already-dispatched" }
  | { readonly status: "failed"; readonly reason: DispatchErrorCategory }

const isAckError = (error: DispatchAdapterError): boolean => error.reason === "auth" || error.reason === "config"

const stringifyCause = (cause: unknown): string | null => {
  if (cause === undefined || cause === null) return null
  if (typeof cause === "string") return cause
  if (typeof cause === "number" || typeof cause === "boolean") return String(cause)
  if (cause instanceof Error) return cause.message
  try {
    return JSON.stringify(cause)
  } catch {
    return String(cause)
  }
}

const errorDetail = (error: DispatchAdapterError): string => {
  const cause = stringifyCause(error.cause)
  return cause && cause.length > 0 ? `${error.message}: ${cause}` : error.message
}

export const sendAgentDispatchUseCase = (input: SendAgentDispatchInput) =>
  Effect.gen(function* () {
    const dispatchRepo = yield* AgentDispatchRepository
    const claim = yield* dispatchRepo.claim({
      configId: input.configId,
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
      trigger: input.trigger,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    })
    if (!claim.claimed || claim.dispatchId === null) {
      return { status: "skipped-already-dispatched" } as const
    }

    const dispatchId = claim.dispatchId
    const credentialRepo = yield* AgentDispatchCredentialRepository
    const credentialRow = yield* credentialRepo.getDecrypted(input.integrationId)
    const credential = {
      ...(credentialRow.cursorApiKey ? { cursorApiKey: credentialRow.cursorApiKey } : {}),
      ...(credentialRow.claudeRoutineToken ? { claudeRoutineToken: credentialRow.claudeRoutineToken } : {}),
      ...(credentialRow.linearApiKey ? { linearApiKey: credentialRow.linearApiKey } : {}),
      ...(credentialRow.webhookSecret ? { webhookSecret: credentialRow.webhookSecret } : {}),
    }

    const adapters = yield* AgentDispatchAdapters
    const adapter = adapters[input.kind]

    const dispatchOutcome = yield* adapter
      .dispatch({
        idempotencyKey: input.idempotencyKey,
        prompt: input.prompt,
        context: input.context,
        config: input.target,
        credential,
      })
      .pipe(
        Effect.match({
          onSuccess: (accepted) => ({ kind: "accepted" as const, accepted }),
          onFailure: (error) => ({ kind: "failed" as const, error }),
        }),
      )

    if (dispatchOutcome.kind === "failed") {
      const error = dispatchOutcome.error
      if (error instanceof DispatchAdapterError && isAckError(error)) {
        yield* dispatchRepo.markFailed({
          dispatchId,
          errorCategory: error.reason as DispatchErrorCategory,
          errorDetail: errorDetail(error),
        })
        return { status: "failed" as const, reason: error.reason as DispatchErrorCategory }
      }
      return yield* Effect.fail(error)
    }

    const accepted = dispatchOutcome.accepted
    yield* dispatchRepo.markDispatched({
      dispatchId,
      ...(accepted.externalAgentId !== undefined ? { externalAgentId: accepted.externalAgentId } : {}),
      ...(accepted.externalRunId !== undefined ? { externalRunId: accepted.externalRunId } : {}),
      ...(accepted.deepLinkUrl !== undefined ? { externalUrl: accepted.deepLinkUrl } : {}),
    })

    return {
      status: "dispatched" as const,
      ...(accepted.deepLinkUrl !== undefined ? { externalUrl: accepted.deepLinkUrl } : {}),
    }
  }).pipe(Effect.withSpan("agentDispatch.send")) as Effect.Effect<
    SendAgentDispatchOutcome,
    DispatchAdapterError | RepositoryError,
    AgentDispatchRepository | AgentDispatchCredentialRepository | AgentDispatchAdapters | SqlClient
  >
