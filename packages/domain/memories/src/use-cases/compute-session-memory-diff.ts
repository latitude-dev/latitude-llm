import type { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { recordTokenDelta } from "./diff-record-bodies.ts"
import { computeSessionWriteEndpoints } from "./session-write-endpoints.ts"

export interface ComputeSessionMemoryDiffInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  /** Restrict to one trace's contribution; omit for the whole session. */
  readonly traceId?: TraceId
}

/**
 * One record's net change within a session/trace, with the before/after bodies
 * for a unified diff. `beforeBody` is `null` for an add; `afterBody` is `null`
 * for a remove. `degraded` marks a change whose relevant body was never captured
 * or has been pruned ([D5]) — the caller shows a fallback, not a misleading diff.
 */
export interface SessionMemoryRecordDiff {
  readonly storeId: string
  readonly recordId: string
  readonly kind: "added" | "updated" | "removed"
  readonly beforeBody: string | null
  readonly afterBody: string | null
  readonly tokensAdded: number
  readonly tokensRemoved: number
  readonly degraded: boolean
  /** Span of the session's last change to this record, for deep-linking to that change; `null` if none. */
  readonly lastChangeSpanId: string | null
}

/** A session's (or trace's) memory writes as per-record before/after diffs. */
export interface SessionMemoryDiff {
  readonly records: readonly SessionMemoryRecordDiff[]
}

/**
 * The per-record diff for a session/trace: each record it mutated, resolved
 * endpoint-to-endpoint ([D2], churn collapsed), with the before/after bodies for
 * a unified diff. Read-only records are excluded — this is the write view.
 */
export const computeSessionMemoryDiffUseCase = Effect.fn("memories.computeSessionMemoryDiff")(function* (
  input: ComputeSessionMemoryDiffInput,
) {
  const { endpoints, bodyByHash } = yield* computeSessionWriteEndpoints(input)
  const body = (hash: string): string | null => (hash === "" ? null : (bodyByHash.get(hash) ?? null))

  const records: SessionMemoryRecordDiff[] = endpoints.map((endpoint) => {
    const beforeBody = body(endpoint.beforeHash)
    const afterBody = endpoint.afterPresent ? body(endpoint.afterHash) : null
    const delta = recordTokenDelta({
      kind: endpoint.kind,
      beforeHash: endpoint.beforeHash,
      afterHash: endpoint.afterHash,
      beforeBody,
      afterBody,
      beforeTokens: endpoint.beforeTokens,
      afterTokens: endpoint.afterTokens,
    })
    return {
      storeId: endpoint.storeId,
      recordId: endpoint.recordId,
      kind: endpoint.kind,
      beforeBody,
      afterBody,
      tokensAdded: delta.tokensAdded,
      tokensRemoved: delta.tokensRemoved,
      degraded: delta.degraded,
      lastChangeSpanId: endpoint.afterSpanId,
    }
  })

  return { records } satisfies SessionMemoryDiff
})
