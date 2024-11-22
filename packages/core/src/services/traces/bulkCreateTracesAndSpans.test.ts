import { beforeEach, describe, expect, it } from 'vitest'

import { Project } from '../../browser'
import { database } from '../../client'
import { SpanKind } from '../../constants'
import { createProject } from '../../tests/factories'
import { bulkCreateTracesAndSpans } from './bulkCreateTracesAndSpans'

describe('bulkCreateTracesAndSpans', () => {
  let project: Project

  beforeEach(async () => {
    project = (await createProject()).project
  })

  it('handles concurrent trace creation gracefully', async () => {
    const traceId = 'test-trace-id'
    const spanId = 'test-span-id'

    // Create first trace
    const result1 = await bulkCreateTracesAndSpans({
      project,
      traces: [
        {
          traceId,
          startTime: new Date(),
        },
      ],
      spans: [
        {
          traceId,
          spanId,
          name: 'test-span',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
      ],
    })

    expect(result1.ok).toBe(true)
    if (!result1.ok) return
    expect(result1.value.traces).toHaveLength(1)
    expect(result1.value.spans).toHaveLength(1)

    // Try to create the same trace again
    const result2 = await bulkCreateTracesAndSpans({
      project,
      traces: [
        {
          traceId,
          startTime: new Date(),
        },
      ],
      spans: [
        {
          traceId,
          spanId: 'another-span-id',
          name: 'test-span-2',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
      ],
    })

    expect(result2.ok).toBe(true)
    if (!result2.ok) return
    expect(result2.value.traces).toHaveLength(0) // No new traces should be created
    expect(result2.value.spans).toHaveLength(1) // New span should be created
  })

  it('creates multiple traces and spans in a single transaction', async () => {
    const result = await bulkCreateTracesAndSpans({
      project,
      traces: [
        { traceId: 'trace-1', startTime: new Date() },
        { traceId: 'trace-2', startTime: new Date() },
      ],
      spans: [
        {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'span-1',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
        {
          traceId: 'trace-2',
          spanId: 'span-2',
          name: 'span-2',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.traces).toHaveLength(2)
    expect(result.value.spans).toHaveLength(2)
  })
})
