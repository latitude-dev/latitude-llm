import type { ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryChangeKind } from "../entities/memory-event.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { recordTokenDelta } from "./diff-record-bodies.ts"

export interface RecordHistoryVersion {
  readonly changeKind: MemoryChangeKind
  readonly tokenCount: number
  /** Tokens added / removed vs. the prior recorded snapshot (line diff; falls back to `tokenCount` when a body is absent). */
  readonly tokensAdded: number
  readonly tokensRemoved: number
  readonly degraded: boolean
  readonly spanId: SpanId
  readonly traceId: TraceId
  readonly sessionId: SessionId
  readonly userId: ExternalUserId
  readonly endTime: Date
}

export interface RecordHistory {
  readonly body: string | null
  readonly tokenCount: number
  /** Mutating versions, newest first. */
  readonly versions: readonly RecordHistoryVersion[]
}

export interface ComputeRecordHistoryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly storeId: string
  readonly recordId: string
}

/**
 * A record's current body plus its full change history, each version carrying
 * its token delta against the prior recorded snapshot. Reads every version's
 * blob once (deduped) so the Changes list and diff header can show `+added
 * −removed` without a per-row round trip. before/after selection mirrors
 * `computeRecordChangeDiffUseCase`: the predecessor is the prior recorded
 * snapshot, `null` for the first version or after a `remove` (re-create).
 */
export const computeRecordHistoryUseCase = Effect.fn("memories.computeRecordHistory")(function* (
  input: ComputeRecordHistoryInput,
) {
  const { organizationId, projectId, storeId, recordId } = input
  const memoryRepository = yield* MemoryRepository

  const versions = yield* memoryRepository.readRecordVersions({
    organizationId,
    projectId,
    records: [{ storeId, recordId }],
  })

  const hashes = new Set<string>()
  for (const version of versions) {
    if (version.changeKind !== "remove" && version.contentHash !== "") hashes.add(version.contentHash)
  }
  const blobs = hashes.size > 0 ? yield* memoryRepository.readBlobs({ organizationId, hashes: [...hashes] }) : []
  const bodyByHash = new Map(blobs.map((blob) => [blob.contentHash, blob.content]))
  const body = (hash: string): string | null => (hash === "" ? null : (bodyByHash.get(hash) ?? null))

  const newestFirst = versions
    .map((version, index): RecordHistoryVersion => {
      const predecessor = index > 0 ? versions[index - 1] : undefined
      const afterHash = version.changeKind === "remove" ? "" : version.contentHash
      const beforeHash = predecessor && predecessor.changeKind !== "remove" ? predecessor.contentHash : ""
      const kind = afterHash === "" ? "removed" : beforeHash === "" ? "added" : "updated"
      const { tokensAdded, tokensRemoved, degraded } = recordTokenDelta({
        kind,
        beforeHash,
        afterHash,
        beforeBody: body(beforeHash),
        afterBody: body(afterHash),
        beforeTokens: predecessor?.tokenCount ?? 0,
        afterTokens: version.tokenCount,
      })
      return {
        changeKind: version.changeKind,
        tokenCount: version.tokenCount,
        tokensAdded,
        tokensRemoved,
        degraded,
        spanId: version.spanId,
        traceId: version.traceId,
        sessionId: version.sessionId,
        userId: version.userId,
        endTime: version.endTime,
      }
    })
    .reverse()

  const latest = newestFirst[0]
  const current = latest && latest.changeKind !== "remove" ? latest : undefined

  return {
    body: current ? body(versions[versions.length - 1]!.contentHash) : null,
    tokenCount: current?.tokenCount ?? 0,
    versions: newestFirst,
  } satisfies RecordHistory
})
