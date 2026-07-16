import type { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryEvent } from "../entities/memory-event.ts"
import type { MemoryRecordVersion } from "../entities/memory-snapshot.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { recordTokenDelta } from "./diff-record-bodies.ts"

export interface ComputeSessionMemorySummaryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  /** Restrict to one trace's contribution; omit for the whole session. */
  readonly traceId?: TraceId
}

export interface ScopeMemorySummary {
  readonly scope: string
  readonly readTokens: number
  readonly tokensAdded: number
  readonly tokensRemoved: number
  readonly recordsAdded: number
  readonly recordsUpdated: number
  readonly recordsRemoved: number
}

export type MemorySummaryTotals = Omit<ScopeMemorySummary, "scope">

/** A session's (or trace's) memory footprint: read tokens plus the write diff, per scope. */
export interface SessionMemorySummary {
  readonly scopes: readonly ScopeMemorySummary[]
  readonly total: MemorySummaryTotals
}

const recordKey = (storeId: string, recordId: string) => `${storeId} ${recordId}`

type WriteEndpoint = {
  readonly scope: string
  readonly storeId: string
  readonly recordId: string
  readonly kind: "added" | "updated" | "removed"
  readonly beforeHash: string
  readonly afterHash: string
  readonly beforeTokens: number
  readonly afterTokens: number
  readonly afterPresent: boolean
}

type MutableScope = { -readonly [K in keyof ScopeMemorySummary]: ScopeMemorySummary[K] }

const emptyTotals = (): MemorySummaryTotals => ({
  readTokens: 0,
  tokensAdded: 0,
  tokensRemoved: 0,
  recordsAdded: 0,
  recordsUpdated: 0,
  recordsRemoved: 0,
})

/**
 * A session's memory footprint: read tokens (Σ over `search_memory` events) plus
 * the write diff under the strict per-record rule ([D2]) — for each record the
 * session touched, `before` is the version current just before the session's
 * first touch and `after` is its last touch; token deltas come from diffing the
 * two bodies, churn between them collapsing to the net change. A whole-store wipe
 * within the session removes the store's records live at the wipe. Results are
 * grouped per scope so a multi-scope session expands to one row each.
 */
export const computeSessionMemorySummaryUseCase = Effect.fn("memories.computeSessionMemorySummary")(function* (
  input: ComputeSessionMemorySummaryInput,
) {
  const { organizationId, projectId, sessionId, traceId } = input
  const memoryRepository = yield* MemoryRepository

  const events = yield* memoryRepository.readSessionMemoryEvents({
    organizationId,
    projectId,
    sessionId,
    ...(traceId !== undefined ? { traceId } : {}),
  })

  const readTokensByScope = new Map<string, number>()
  const endpoints: WriteEndpoint[] = []
  const hashes = new Set<string>()

  for (const scope of new Set(events.map((event) => event.scope))) {
    const scopeEvents = events.filter((event) => event.scope === scope)
    let readTokens = 0
    const mutatingByRecord = new Map<string, MemoryEvent[]>()
    const wipeAtByStore = new Map<string, Date>()

    for (const event of scopeEvents) {
      if (event.changeKind === "read") {
        readTokens += event.tokenCount
      } else if (event.changeKind === "store_delete") {
        const prev = wipeAtByStore.get(event.storeId)
        if (prev === undefined || event.endTime.getTime() > prev.getTime())
          wipeAtByStore.set(event.storeId, event.endTime)
      } else if (event.changeKind === "add" || event.changeKind === "update" || event.changeKind === "remove") {
        const key = recordKey(event.storeId, event.recordId)
        const list = mutatingByRecord.get(key)
        if (list) list.push(event)
        else mutatingByRecord.set(key, [event])
      }
    }
    readTokensByScope.set(scope, readTokens)

    const addEndpoint = (endpoint: Omit<WriteEndpoint, "scope" | "kind">) => {
      const { beforeHash, afterHash, afterPresent } = endpoint
      const kind = !afterPresent
        ? beforeHash === ""
          ? null
          : "removed"
        : beforeHash === ""
          ? "added"
          : afterHash === beforeHash
            ? null
            : "updated"
      if (kind === null) return
      endpoints.push({ scope, kind, ...endpoint })
      if (beforeHash !== "") hashes.add(beforeHash)
      if (afterPresent && afterHash !== "") hashes.add(afterHash)
    }

    const touchedRecords = [...mutatingByRecord.values()].map((list) => ({
      storeId: list[0]!.storeId,
      recordId: list[0]!.recordId,
    }))
    const versions =
      touchedRecords.length > 0
        ? yield* memoryRepository.readRecordVersions({ organizationId, projectId, scope, records: touchedRecords })
        : []
    const chainByRecord = new Map<string, MemoryRecordVersion[]>()
    for (const version of versions) {
      const key = recordKey(version.storeId, version.recordId)
      const list = chainByRecord.get(key)
      if (list) list.push(version)
      else chainByRecord.set(key, [version])
    }

    for (const [key, list] of mutatingByRecord) {
      const first = list[0]!
      const last = list[list.length - 1]!
      // chain is end_time ASC; the last version before the session's first touch is the "before".
      let before: MemoryRecordVersion | undefined
      for (const version of chainByRecord.get(key) ?? []) {
        if (version.endTime.getTime() < first.endTime.getTime()) before = version
      }
      const beforePresent = before !== undefined && before.changeKind !== "remove"
      const wipeAt = wipeAtByStore.get(first.storeId)
      const wipedAfter = wipeAt !== undefined && wipeAt.getTime() > last.endTime.getTime()
      const afterPresent = wipedAfter ? false : last.changeKind !== "remove"
      addEndpoint({
        storeId: first.storeId,
        recordId: first.recordId,
        beforeHash: beforePresent ? before!.contentHash : "",
        beforeTokens: beforePresent ? before!.tokenCount : 0,
        afterHash: afterPresent ? last.contentHash : "",
        afterTokens: afterPresent ? last.tokenCount : 0,
        afterPresent,
      })
    }

    // Records the wipe removed that the session did not otherwise touch: read the
    // store's live records as of the wipe (raw ledger, not the wipe-filtered
    // reconstruction) and count each as removed.
    const touchedKeys = new Set(mutatingByRecord.keys())
    for (const [storeId, wipeAt] of wipeAtByStore) {
      const manifest = yield* memoryRepository.readManifestAt({ organizationId, projectId, scope, at: wipeAt })
      for (const record of manifest) {
        if (record.storeId !== storeId || touchedKeys.has(recordKey(record.storeId, record.recordId))) continue
        addEndpoint({
          storeId: record.storeId,
          recordId: record.recordId,
          beforeHash: record.contentHash,
          beforeTokens: record.tokenCount,
          afterHash: "",
          afterTokens: 0,
          afterPresent: false,
        })
      }
    }
  }

  const blobs = yield* memoryRepository.readBlobs({ organizationId, hashes: [...hashes] })
  const bodyByHash = new Map(blobs.map((blob) => [blob.contentHash, blob.content]))
  const body = (hash: string): string | null => (hash === "" ? null : (bodyByHash.get(hash) ?? null))

  const byScope = new Map<string, MutableScope>()
  const scopeOf = (scope: string): MutableScope => {
    let summary = byScope.get(scope)
    if (!summary) {
      summary = { ...emptyTotals(), scope, readTokens: readTokensByScope.get(scope) ?? 0 }
      byScope.set(scope, summary)
    }
    return summary
  }
  for (const scope of readTokensByScope.keys()) scopeOf(scope)

  for (const endpoint of endpoints) {
    const summary = scopeOf(endpoint.scope)
    const delta = recordTokenDelta({
      kind: endpoint.kind,
      beforeHash: endpoint.beforeHash,
      afterHash: endpoint.afterHash,
      beforeBody: body(endpoint.beforeHash),
      afterBody: endpoint.afterPresent ? body(endpoint.afterHash) : null,
      beforeTokens: endpoint.beforeTokens,
      afterTokens: endpoint.afterTokens,
    })
    summary.tokensAdded += delta.tokensAdded
    summary.tokensRemoved += delta.tokensRemoved
    if (endpoint.kind === "added") summary.recordsAdded += 1
    else if (endpoint.kind === "updated") summary.recordsUpdated += 1
    else summary.recordsRemoved += 1
  }

  const scopes = [...byScope.values()].filter(
    (summary) =>
      summary.readTokens > 0 || summary.recordsAdded > 0 || summary.recordsUpdated > 0 || summary.recordsRemoved > 0,
  )
  const total = scopes.reduce<MemorySummaryTotals>(
    (acc, summary) => ({
      readTokens: acc.readTokens + summary.readTokens,
      tokensAdded: acc.tokensAdded + summary.tokensAdded,
      tokensRemoved: acc.tokensRemoved + summary.tokensRemoved,
      recordsAdded: acc.recordsAdded + summary.recordsAdded,
      recordsUpdated: acc.recordsUpdated + summary.recordsUpdated,
      recordsRemoved: acc.recordsRemoved + summary.recordsRemoved,
    }),
    emptyTotals(),
  )

  return { scopes, total } satisfies SessionMemorySummary
})
