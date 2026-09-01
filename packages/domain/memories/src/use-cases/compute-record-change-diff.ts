import { NotFoundError, type OrganizationId, type ProjectId, type SpanId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryChangeKind } from "../entities/memory-event.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"

export interface ComputeRecordChangeDiffInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly storeId: string
  readonly recordId: string
  /** The span that authored the version to diff — the "after" side. */
  readonly spanId: SpanId
}

/**
 * The before/after bodies of one record change, for a unified diff. `after` is
 * the version authored by `spanId`; `before` is its predecessor in the record's
 * mutating chain — `null` for the record's first version, or when the predecessor
 * was a `remove` (this change re-created the record). `afterBody` is `null` for a
 * `remove`. `degraded` marks a side whose content was never captured or whose
 * blob has been pruned ([D5]) — the caller shows a fallback rather than a
 * misleading whole-body diff.
 */
export interface RecordChangeDiff {
  readonly changeKind: MemoryChangeKind
  readonly beforeBody: string | null
  readonly afterBody: string | null
  readonly degraded: boolean
}

export const computeRecordChangeDiffUseCase = Effect.fn("memories.computeRecordChangeDiff")(function* (
  input: ComputeRecordChangeDiffInput,
) {
  const { organizationId, projectId, storeId, recordId, spanId } = input
  const memoryRepository = yield* MemoryRepository

  const versions = yield* memoryRepository.readRecordVersions({
    organizationId,
    projectId,
    records: [{ storeId, recordId }],
  })
  // Chain is end_time ASC; the predecessor is the record's prior recorded snapshot.
  const index = versions.findIndex((version) => version.spanId === spanId)
  if (index === -1) return yield* new NotFoundError({ entity: "MemoryRecordChange", id: spanId })
  const after = versions[index]!
  const predecessor = index > 0 ? versions[index - 1] : undefined

  const afterHash = after.changeKind === "remove" ? "" : after.contentHash
  const beforeHash = predecessor && predecessor.changeKind !== "remove" ? predecessor.contentHash : ""

  const blobs = yield* memoryRepository.readBlobs({ organizationId, hashes: [beforeHash, afterHash] })
  const bodyByHash = new Map(blobs.map((blob) => [blob.contentHash, blob.content]))
  const body = (hash: string): string | null => (hash === "" ? null : (bodyByHash.get(hash) ?? null))

  const beforeBody = body(beforeHash)
  const afterBody = body(afterHash)
  const degraded = (beforeHash !== "" && beforeBody === null) || (afterHash !== "" && afterBody === null)

  return { changeKind: after.changeKind, beforeBody, afterBody, degraded } satisfies RecordChangeDiff
})
