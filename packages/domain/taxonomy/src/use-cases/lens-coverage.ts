import type { CustomBehaviorId, FacetId, OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import {
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TAXONOMY_LENS_COVERAGE_HORIZON_DAYS,
  TAXONOMY_LENS_COVERAGE_MIN_RATE_FRACTION,
} from "../constants.ts"
import type { TaxonomyObservationDayCount } from "../ports/taxonomy-observation-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import type {
  TaxonomyViewAssignmentDayCount,
  TaxonomyViewAssignmentRepositoryShape,
} from "../ports/taxonomy-view-assignment-repository.ts"

const MS_PER_DAY = 24 * 60 * 60_000

/**
 * The band a facet lens can honestly answer for. Facet plans are off-mode, so
 * they never take the full-window reassignment path that keeps a cohort view's
 * topic slice and the global tree covering whole project history: membership is
 * whatever the gardening windows happened to write, accumulated from lens
 * creation and eroding behind the latest pass. Reads clipped to this band report
 * a real count for a real range; outside it they would report a sampling ramp.
 */
export interface TaxonomyLensCoverage {
  /** Start of the oldest fully-covered UTC day. */
  readonly from: Date
  /** End of the newest day the lens has membership for, never past `now`. */
  readonly to: Date
}

export interface TaxonomyLensCoverageDay {
  /** Start of the UTC day. */
  readonly day: Date
  /** Rows pointing at a currently-active cluster. */
  readonly assignedCount: number
  /** Observations a pass could have clustered that day. */
  readonly clusterableCount: number
}

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

const dayKey = (date: Date): number => startOfUtcDay(date).getTime()

const lensCoverageScanStart = (now: Date): Date =>
  startOfUtcDay(new Date(now.getTime() - TAXONOMY_LENS_COVERAGE_HORIZON_DAYS * MS_PER_DAY))

/** Outer-join the two per-day counts into one ascending series. */
export const joinLensCoverageDays = (
  assigned: readonly TaxonomyViewAssignmentDayCount[],
  clusterable: readonly TaxonomyObservationDayCount[],
): readonly TaxonomyLensCoverageDay[] => {
  const byDay = new Map<number, { assignedCount: number; clusterableCount: number }>()
  const at = (day: Date) => {
    const key = dayKey(day)
    const existing = byDay.get(key)
    if (existing) return existing
    const created = { assignedCount: 0, clusterableCount: 0 }
    byDay.set(key, created)
    return created
  }
  for (const row of assigned) at(row.day).assignedCount += row.count
  for (const row of clusterable) at(row.day).clusterableCount += row.count
  return [...byDay.entries()]
    .sort(([left], [right]) => left - right)
    .map(([key, counts]) => ({ day: new Date(key), ...counts }))
}

/**
 * Walk back from the newest day with membership while each day's assigned share
 * holds at the lens's current rate, and return that contiguous band.
 *
 * The rate reference is the pooled share over the trailing gardening window
 * rather than a fixed 100%: the sample is capped, so a busy lens plateaus well
 * below full coverage and an absolute test would clip it to nothing. Days with
 * no clusterable traffic are neither covered nor missing, so they extend the band
 * without being judged, and the newest day is always included — it is partial by
 * nature, exactly like the live edge of any other chart.
 */
export const resolveLensCoverage = (
  days: readonly TaxonomyLensCoverageDay[],
  input: { readonly now: Date },
): TaxonomyLensCoverage | null => {
  const ordered = [...days].sort((left, right) => left.day.getTime() - right.day.getTime())
  let lastIndex = -1
  for (let index = ordered.length - 1; index >= 0; index--) {
    if ((ordered[index]?.assignedCount ?? 0) > 0) {
      lastIndex = index
      break
    }
  }
  const last = ordered[lastIndex]
  if (last === undefined) return null

  // The latest sweep's own window, minus the partial newest day: the days the
  // lens has certainly been written for, pooled so one thin day cannot set the bar.
  const referenceFrom = last.day.getTime() - (TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS - 1) * MS_PER_DAY
  const reference = ordered.filter(
    (day) => day.day.getTime() >= referenceFrom && day.day.getTime() < last.day.getTime(),
  )
  const rated = reference.length > 0 ? reference : [last]
  const referenceClusterable = rated.reduce((sum, day) => sum + day.clusterableCount, 0)
  const referenceAssigned = rated.reduce((sum, day) => sum + day.assignedCount, 0)
  const referenceRate = referenceClusterable > 0 ? referenceAssigned / referenceClusterable : 1
  const minRate = referenceRate * TAXONOMY_LENS_COVERAGE_MIN_RATE_FRACTION

  let startIndex = lastIndex
  for (let index = lastIndex - 1; index >= 0; index--) {
    const day = ordered[index]
    if (day === undefined) break
    if (day.clusterableCount > 0 && day.assignedCount / day.clusterableCount < minRate) break
    startIndex = index
  }

  const from = ordered[startIndex]?.day ?? last.day
  const endOfLastDay = last.day.getTime() + MS_PER_DAY
  return { from, to: new Date(Math.min(input.now.getTime(), endOfLastDay)) }
}

/**
 * Intersect a requested window with the covered band. Absent bounds are open, so
 * an "All time" read comes back as exactly the covered band rather than the whole
 * slice — which is what stops a four-month selection from reporting nine days of
 * counts under a four-month label.
 */
export const clipRangeToLensCoverage = (
  range: { readonly from?: Date | undefined; readonly to?: Date | undefined },
  coverage: TaxonomyLensCoverage | null,
): { readonly from?: Date; readonly to?: Date } => {
  if (coverage === null) return { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) }
  const from = range.from && range.from > coverage.from ? range.from : coverage.from
  const to = range.to && range.to < coverage.to ? range.to : coverage.to
  return { from, to: to > from ? to : from }
}

interface GetLensCoverageInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly customBehaviorId: CustomBehaviorId
  readonly facetId: FacetId
  readonly clusterIds: readonly TaxonomyClusterId[]
  readonly assignments: TaxonomyViewAssignmentRepositoryShape
  readonly now: Date
}

export const getLensCoverageUseCase = (input: GetLensCoverageInput) =>
  Effect.gen(function* () {
    if (input.clusterIds.length === 0) return null
    const observations = yield* TaxonomyObservationRepository
    const since = lensCoverageScanStart(input.now)
    const [assigned, clusterable] = yield* Effect.all(
      [
        input.assignments.getAssignedCountsByDay({
          organizationId: input.organizationId,
          projectId: input.projectId,
          customBehaviorId: input.customBehaviorId,
          facetId: input.facetId,
          clusterIds: input.clusterIds,
          since,
        }),
        observations.getClusterableCountsByDay({
          organizationId: input.organizationId,
          projectId: input.projectId,
          since,
        }),
      ],
      { concurrency: 2 },
    )
    return resolveLensCoverage(joinLensCoverageDays(assigned, clusterable), { now: input.now })
  })
