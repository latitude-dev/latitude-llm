import { describe, it, expect, beforeAll } from 'vitest'
import { bulkCreateTracesAndSpans } from './bulkCreateTracesAndSpans'
import { SpanKind } from '../../constants'
import { createProject } from '../../tests/factories'
import { Workspace } from '../../browser'

describe('bulkCreateTracesAndSpans', async () => {
  let workspace: Workspace

  beforeAll(async () => {
    const { workspace: w } = await createProject()
    workspace = w
  })

  it('should create new traces and spans', async () => {
    const result = await bulkCreateTracesAndSpans({
      workspace,
      traces: [
        {
          traceId: 'trace1',
          startTime: new Date(),
        },
      ],
      spans: [
        {
          traceId: 'trace1',
          spanId: 'span1',
          name: 'test span',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.traces).toHaveLength(1)
    expect(result.value!.spans).toHaveLength(1)
  })

  it('should update existing traces and spans', async () => {
    // First create initial data
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [
        {
          traceId: 'trace1',
          startTime: new Date(),
          status: 'initial',
        },
      ],
      spans: [
        {
          traceId: 'trace1',
          spanId: 'span1',
          name: 'initial name',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
      ],
    })

    // Then update the same trace and span
    const updateResult = await bulkCreateTracesAndSpans({
      workspace,
      traces: [
        {
          traceId: 'trace1',
          startTime: new Date(),
          status: 'updated',
        },
      ],
      spans: [
        {
          traceId: 'trace1',
          spanId: 'span1',
          name: 'updated name',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
      ],
    })

    expect(updateResult.ok).toBe(true)
    if (!updateResult.ok) return

    const updatedSpan = updateResult.value!.spans[0]
    expect(updatedSpan!.name).toBe('updated name')
  })

  it('should handle mixed create and update operations', async () => {
    // First create initial data
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [
        {
          traceId: 'trace1',
          startTime: new Date(),
        },
      ],
      spans: [
        {
          traceId: 'trace1',
          spanId: 'span1',
          name: 'existing span',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
      ],
    })

    // Then do a mixed operation
    const result = await bulkCreateTracesAndSpans({
      workspace,
      traces: [
        {
          traceId: 'trace1',
          startTime: new Date(),
        },
        {
          traceId: 'trace2',
          startTime: new Date(),
        },
      ],
      spans: [
        {
          traceId: 'trace1',
          spanId: 'span1',
          name: 'updated span',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
        {
          traceId: 'trace2',
          spanId: 'span2',
          name: 'new span',
          kind: SpanKind.Client,
          startTime: new Date(),
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.traces).toHaveLength(2)
    expect(result.value!.spans).toHaveLength(2)

    const updatedSpan = result.value!.spans.find((s) => s.spanId === 'span1')
    const newSpan = result.value!.spans.find((s) => s.spanId === 'span2')

    expect(updatedSpan?.name).toBe('updated span')
    expect(newSpan?.name).toBe('new span')
  })
})
