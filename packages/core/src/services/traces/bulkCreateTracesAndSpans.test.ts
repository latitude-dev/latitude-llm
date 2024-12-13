import { beforeEach, describe, expect, it } from 'vitest'

import { Workspace } from '../../browser'
import { SpanKind } from '../../constants'
import { createProject } from '../../tests/factories'
import { bulkCreateTracesAndSpans } from './bulkCreateTracesAndSpans'

describe('bulkCreateTracesAndSpans', () => {
  let workspace: Workspace

  beforeEach(async () => {
    workspace = (await createProject()).workspace
  })

  it('handles concurrent trace creation gracefully', async () => {
    const traceId = 'test-trace-id'
    const spanId = 'test-span-id'

    // Create first trace
    const result1 = await bulkCreateTracesAndSpans({
      workspace,
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
    expect(result1.unwrap().traces).toHaveLength(1)
    expect(result1.unwrap().spans).toHaveLength(1)

    // Try to create the same trace again
    const result2 = await bulkCreateTracesAndSpans({
      workspace,
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
    expect(result2.unwrap().traces).toHaveLength(0) // No new traces should be created
    expect(result2.unwrap().spans).toHaveLength(1) // New span should be created
  })

  it('creates multiple traces and spans in a single transaction', async () => {
    const result = await bulkCreateTracesAndSpans({
      workspace,
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
    expect(result.unwrap().traces).toHaveLength(2)
    expect(result.unwrap().spans).toHaveLength(2)
  })
})
