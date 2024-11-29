import { describe, it, expect } from 'vitest'
import { calculateTraceMetrics } from './utils'
import { TraceWithSpans } from '@latitude-data/core/browser'

describe('calculateTraceMetrics', () => {
  it('calculates duration as difference between earliest start and latest end time', () => {
    const trace: TraceWithSpans = {
      id: '1',
      spans: [
        {
          id: '1',
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-01T00:00:05Z',
        },
        {
          id: '2',
          startTime: '2024-01-01T00:00:02Z',
          endTime: '2024-01-01T00:00:10Z',
        },
      ],
    }

    const metrics = calculateTraceMetrics(trace)

    // Duration should be 10 seconds (10000ms)
    expect(metrics.totalDuration).toBe(10000)
  })

  it('handles invalid timestamps gracefully', () => {
    const trace: TraceWithSpans = {
      id: '1',
      spans: [
        {
          id: '1',
          startTime: 'invalid-date',
          endTime: '2024-01-01T00:00:05Z',
        },
      ],
    }

    const metrics = calculateTraceMetrics(trace)
    expect(metrics.totalDuration).toBe(0)
  })
})
