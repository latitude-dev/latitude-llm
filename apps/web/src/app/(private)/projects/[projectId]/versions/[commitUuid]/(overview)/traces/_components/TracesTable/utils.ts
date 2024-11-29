import { TraceWithSpans } from '@latitude-data/core/browser'
import { compactObject } from '@latitude-data/core/lib/compactObject'

export function calculateTraceMetrics(trace: TraceWithSpans) {
  let totalCost = 0
  let totalTokens = 0
  const models = new Set<string>()

  let minStartTime: number | null = null
  let maxEndTime: number | null = null

  trace.spans.forEach((span) => {
    if (span.startTime && span.endTime) {
      try {
        const startTimeMs = new Date(span.startTime).getTime()
        const endTimeMs = new Date(span.endTime).getTime()

        if (minStartTime === null || startTimeMs < minStartTime) {
          minStartTime = startTimeMs
        }
        if (maxEndTime === null || endTimeMs > maxEndTime) {
          maxEndTime = endTimeMs
        }
      } catch (e) {
        // do nothing, invalid timestamps encountered
      }
    }
    if (span.totalCostInMillicents) {
      totalCost += Number(span.totalCostInMillicents)
    }
    if (span.totalTokens) {
      totalTokens += Number(span.totalTokens)
    }
    if (span.model) {
      models.add(String(span.model))
    }
  })

  const totalDuration =
    minStartTime && maxEndTime ? maxEndTime - minStartTime : 0

  return {
    totalDuration,
    totalCost,
    totalTokens,
    models: Array.from(models),
  }
}
