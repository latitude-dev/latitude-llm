import type { MemoryEvent } from "@domain/memories"
import type { CostMetricReading, CostReadingBase, CostSourceObservation } from "../../entities/cost-metric-reading.ts"
import { notApplicableReading, unreadableReading } from "../../entities/cost-metric-reading.ts"

const REPEATED_ZERO_HIT_BASE = {
  metricId: "memory.repeated_zero_hit",
  family: "memory",
  rawUnit: "memoryReads",
  aggregation: "eventRate",
} as const satisfies CostReadingBase

const NOOP_REWRITE_BASE = {
  metricId: "memory.noop_rewrite",
  family: "memory",
  rawUnit: "memoryWrites",
  aggregation: "eventRate",
} as const satisfies CostReadingBase

const REVERTED_WRITE_BASE = {
  metricId: "memory.reverted_write",
  family: "memory",
  rawUnit: "memoryWrites",
  aggregation: "eventRate",
} as const satisfies CostReadingBase

const WRITE_KINDS = new Set(["add", "update", "remove"])

/**
 * Memory operations have no billable cost of their own. These readers count inefficient operation
 * equivalents; a token or money effect exists only where a separate reader can attribute the
 * content to a later model input or a paid retry.
 */
const eventAtomId = (event: MemoryEvent): string =>
  `memoryEvent:${event.traceId}:${event.spanId}:${event.storeId}:${event.recordId}`

const chronological = (events: readonly MemoryEvent[]): MemoryEvent[] =>
  [...events].sort(
    (left, right) => left.endTime.getTime() - right.endTime.getTime() || left.spanId.localeCompare(right.spanId),
  )

const observationsFor = (events: readonly MemoryEvent[], adverse: ReadonlySet<string>): CostSourceObservation[] =>
  events.map((event) => ({
    atomId: eventAtomId(event),
    eligibleUnits: 1,
    adverseUnits: adverse.has(eventAtomId(event)) ? 1 : 0,
  }))

const eventRateReading = ({
  base,
  eligible,
  adverse,
  unit,
}: {
  readonly base: CostReadingBase
  readonly eligible: readonly MemoryEvent[]
  readonly adverse: ReadonlySet<string>
  readonly unit: string
}): CostMetricReading => ({
  ...base,
  applicability: "applicable",
  readability: "readable",
  rawValue: adverse.size / eligible.length,
  eligibleUnits: eligible.length,
  adverseUnits: adverse.size,
  observations: observationsFor(eligible, adverse),
  evidence: "confirmed",
  nativeImpact: { unit, point: adverse.size },
  limitations: [],
})

/**
 * `memory.repeated_zero_hit` — repeated guarded zero-hit reads over readable memory reads.
 *
 * The first search that finds nothing is information; asking the identical question again and
 * getting nothing again is the waste. Empty query text is unreadable rather than a match, because
 * hashing an empty query would collide every unrelated search in the session.
 */
export const readRepeatedZeroHits = (events: readonly MemoryEvent[]): CostMetricReading => {
  const reads = events.filter((event) => event.changeKind === "read")
  if (reads.length === 0) return notApplicableReading(REPEATED_ZERO_HIT_BASE)
  const readable = reads.filter((event) => event.queryText.trim() !== "")
  if (readable.length === 0) return unreadableReading(REPEATED_ZERO_HIT_BASE, ["missingContent"], reads.length)

  const seen = new Set<string>()
  const adverse = new Set<string>()
  for (const event of chronological(readable)) {
    if (event.recordCount > 0) continue
    const query = `${event.storeId} ${event.queryText.trim()}`
    if (seen.has(query)) adverse.add(eventAtomId(event))
    else seen.add(query)
  }

  return eventRateReading({ base: REPEATED_ZERO_HIT_BASE, eligible: readable, adverse, unit: "memoryReads" })
}

/**
 * `memory.noop_rewrite` — guarded no-op writes over readable memory writes.
 *
 * A write whose content hash already matched the record's is work that changed nothing. Both
 * hashes must be non-empty: an absent hash cannot establish equality, and treating two blanks as
 * equal would call every uninstrumented write a no-op.
 */
export const readNoopRewrites = (events: readonly MemoryEvent[]): CostMetricReading => {
  const writes = events.filter((event) => WRITE_KINDS.has(event.changeKind))
  if (writes.length === 0) return notApplicableReading(NOOP_REWRITE_BASE)
  const readable = writes.filter((event) => event.contentHash.trim() !== "")
  if (readable.length === 0) return unreadableReading(NOOP_REWRITE_BASE, ["missingContent"], writes.length)

  const lastHashByRecord = new Map<string, string>()
  const adverse = new Set<string>()
  for (const event of chronological(readable)) {
    const record = `${event.storeId} ${event.recordId}`
    const previous = lastHashByRecord.get(record)
    if (previous !== undefined && previous === event.contentHash) adverse.add(eventAtomId(event))
    lastHashByRecord.set(record, event.contentHash)
  }

  return eventRateReading({ base: NOOP_REWRITE_BASE, eligible: readable, adverse, unit: "memoryWrites" })
}

/**
 * `memory.reverted_write` — intermediate writes undone inside the same session.
 *
 * A record written to B and then back to A means the B write was wasted. Only the intermediate
 * write is charged: the restoring write is the correction, and counting both would charge the
 * session twice for one mistake. The overlap group keeps this off a no-op it already explains.
 */
export const readRevertedWrites = (events: readonly MemoryEvent[]): CostMetricReading => {
  const writes = events.filter((event) => WRITE_KINDS.has(event.changeKind))
  if (writes.length === 0) return notApplicableReading(REVERTED_WRITE_BASE)
  const readable = writes.filter((event) => event.contentHash.trim() !== "")
  if (readable.length === 0) return unreadableReading(REVERTED_WRITE_BASE, ["missingContent"], writes.length)

  const byRecord = new Map<string, MemoryEvent[]>()
  for (const event of chronological(readable)) {
    const record = `${event.storeId} ${event.recordId}`
    byRecord.set(record, [...(byRecord.get(record) ?? []), event])
  }

  const adverse = new Set<string>()
  for (const history of byRecord.values()) {
    for (let index = 1; index < history.length - 1; index += 1) {
      const before = history[index - 1] as MemoryEvent
      const intermediate = history[index] as MemoryEvent
      const restored = history.slice(index + 1).find((event) => event.contentHash === before.contentHash)
      if (restored && intermediate.contentHash !== before.contentHash) adverse.add(eventAtomId(intermediate))
    }
  }

  return eventRateReading({ base: REVERTED_WRITE_BASE, eligible: readable, adverse, unit: "memoryWrites" })
}
