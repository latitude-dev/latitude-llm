import type { TraceEndSelectionResult } from "./select-trace-end-items.ts"

export type TraceEndItemDecisionCounts = {
  readonly selectedCount: number
  readonly sampledOutCount: number
  readonly filterMissCount: number
}

type MutableDecisionCounts = {
  selectedCount: number
  sampledOutCount: number
  filterMissCount: number
}

export const summarizeTraceEndItemDecisions = (
  itemKeys: readonly string[],
  decisions: TraceEndSelectionResult,
): TraceEndItemDecisionCounts => {
  const summary: MutableDecisionCounts = {
    selectedCount: 0,
    sampledOutCount: 0,
    filterMissCount: 0,
  }

  for (const itemKey of itemKeys) {
    const reason = decisions[itemKey]?.reason

    if (reason === "selected") {
      summary.selectedCount += 1
    } else if (reason === "filter-miss") {
      summary.filterMissCount += 1
    } else {
      summary.sampledOutCount += 1
    }
  }

  return summary
}
