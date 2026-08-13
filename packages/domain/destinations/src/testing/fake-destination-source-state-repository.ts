import type { DestinationId } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_IDLE_BACKOFF_MAX_MS } from "../constants.ts"
import type { Destination } from "../entities/destination.ts"
import type { DestinationSourceState } from "../entities/destination-source-state.ts"
import type {
  DestinationSourceStateRepositoryShape,
  DueDestinationSource,
} from "../ports/destination-source-state-repository.ts"

/**
 * In-memory DestinationSourceStateRepository. `listDue` joins source rows to the
 * destinations array (the real repo does this in SQL), filters to enabled
 * sources of active destinations, and applies the idle-backoff formula;
 * `advanceCursor` is a CAS that rejects stale writes. Pass the same
 * `destinations` array the fake DestinationRepository holds so the join stays
 * consistent. Seed only non-sandbox rows — sandbox exclusion is a SQL join in
 * the real repo.
 */
export const createFakeDestinationSourceStateRepository = (
  seedRows: readonly DestinationSourceState[] = [],
  destinations: readonly Destination[] = [],
) => {
  const rows: DestinationSourceState[] = [...seedRows]
  const find = (destinationId: DestinationId, source: string) =>
    rows.find((r) => r.destinationId === destinationId && r.source === source)

  const repo: DestinationSourceStateRepositoryShape = {
    create: (sourceState) =>
      Effect.sync(() => {
        rows.push(sourceState)
      }),
    findByDestinationAndSource: ({ destinationId, source }) => Effect.sync(() => find(destinationId, source) ?? null),
    listByDestinationId: (destinationId) => Effect.sync(() => rows.filter((r) => r.destinationId === destinationId)),
    listDue: (now: Date) =>
      Effect.sync(() => {
        const due: DueDestinationSource[] = []
        for (const sourceState of rows) {
          if (sourceState.status !== "enabled") continue
          const destination = destinations.find((d) => d.id === sourceState.destinationId)
          if (!destination || destination.status !== "active") continue
          if (sourceState.lastRunAt === null) {
            due.push({ destination, sourceState })
            continue
          }
          const backoffMs = Math.min(
            destination.config.intervalMs * 2 ** sourceState.consecutiveEmptyRuns,
            DESTINATION_IDLE_BACKOFF_MAX_MS,
          )
          if (sourceState.lastRunAt.getTime() + backoffMs <= now.getTime()) due.push({ destination, sourceState })
        }
        return due
      }),
    advanceCursor: ({ destinationId, source, expected, next }) =>
      Effect.sync(() => {
        const row = find(destinationId, source)
        if (
          !row ||
          row.watermark.getTime() !== expected.watermark.getTime() ||
          row.watermarkId !== expected.id ||
          row.watermarkTraceId !== (expected.traceId ?? "")
        ) {
          return false
        }
        ;(row as { watermark: Date }).watermark = next.watermark
        ;(row as { watermarkId: string }).watermarkId = next.id
        ;(row as { watermarkTraceId: string }).watermarkTraceId = next.traceId ?? ""
        return true
      }),
    updateRunState: ({ destinationId, source, consecutiveEmptyRuns, lastRunAt }) =>
      Effect.sync(() => {
        const index = rows.findIndex((r) => r.destinationId === destinationId && r.source === source)
        if (index < 0) return
        const row = rows[index]
        if (!row) return
        rows[index] = { ...row, consecutiveEmptyRuns, lastRunAt, updatedAt: new Date() }
      }),
    setWatermark: ({ destinationId, source, watermark }) =>
      Effect.sync(() => {
        const row = find(destinationId, source)
        if (!row) return
        ;(row as { watermark: Date }).watermark = watermark.watermark
        ;(row as { watermarkId: string }).watermarkId = watermark.id
        ;(row as { watermarkTraceId: string }).watermarkTraceId = watermark.traceId ?? ""
      }),
    updateConfig: ({ destinationId, source, config, status }) =>
      Effect.sync(() => {
        const index = rows.findIndex((r) => r.destinationId === destinationId && r.source === source)
        if (index < 0) return
        const row = rows[index]
        if (!row) return
        rows[index] = {
          ...row,
          ...(config === undefined ? {} : { config }),
          ...(status === undefined ? {} : { status }),
          updatedAt: new Date(),
        }
      }),
    extendCoverageStart: ({ destinationId, source, to }) =>
      Effect.sync(() => {
        const row = find(destinationId, source)
        if (!row) return
        if (to.getTime() < row.coverageStartAt.getTime()) {
          ;(row as { coverageStartAt: Date }).coverageStartAt = to
        }
      }),
    acquireBackfill: ({ destinationId, source, at, staleBefore }) =>
      Effect.sync(() => {
        const row = find(destinationId, source)
        if (!row) return false
        const inFlight = row.backfillStartedAt !== null && row.updatedAt.getTime() >= staleBefore.getTime()
        if (inFlight) return false
        ;(row as { backfillStartedAt: Date | null }).backfillStartedAt = at
        ;(row as { updatedAt: Date }).updatedAt = at
        return true
      }),
    setBackfillStartedAt: ({ destinationId, source, at }) =>
      Effect.sync(() => {
        const row = find(destinationId, source)
        if (!row) return
        ;(row as { backfillStartedAt: Date | null }).backfillStartedAt = at
      }),
    setBackfillProgress: ({ destinationId, source, at }) =>
      Effect.sync(() => {
        const row = find(destinationId, source)
        if (!row) return
        ;(row as { backfillProgressAt: Date | null }).backfillProgressAt = at
      }),
    resetCoverageStart: (destinationId) =>
      Effect.sync(() => {
        for (const row of rows) {
          if (row.destinationId === destinationId) {
            ;(row as { coverageStartAt: Date }).coverageStartAt = row.createdAt
          }
        }
      }),
    deleteByDestinationId: (destinationId: DestinationId) =>
      Effect.sync(() => {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i]?.destinationId === destinationId) rows.splice(i, 1)
        }
      }),
  }

  return { repo, rows }
}
