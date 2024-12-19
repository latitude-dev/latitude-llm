import { describe, it, expect, beforeAll } from 'vitest'
import { bulkCreateTracesAndSpans } from './bulkCreateTracesAndSpans'
import { SpanKind } from '../../constants'
import { createProject } from '../../tests/factories'
import { Workspace } from '../../browser'
import { ToolCall } from '@latitude-data/compiler'

describe('bulkCreateTracesAndSpans', async () => {
  let workspace: Workspace

  beforeAll(async () => {
    const { workspace: w } = await createProject()
    workspace = w
  })

  it('should merge JSON object fields when inserting duplicate spans', async () => {
    const traceId = 'trace-1'
    const spanId = 'span-1'
    const baseSpan = {
      traceId,
      spanId,
      name: 'test-span',
      kind: SpanKind.Client,
      startTime: new Date(),
    }

    // First insertion
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          attributes: { key1: 'value1', key2: 'value2' },
          metadata: { meta1: 'value1' },
          modelParameters: { param1: 'value1' },
          parameters: { custom1: 'value1' },
        },
      ],
    })

    // Second insertion with different values
    const result2 = await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          attributes: { key2: 'updated-value2', key3: 'value3' },
          metadata: { meta2: 'value2' },
          modelParameters: { param2: 'value2' },
          parameters: { custom2: 'value2' },
        },
      ],
    })

    const finalSpan = result2.unwrap().spans[0]!
    expect(finalSpan.attributes).toEqual({
      key1: 'value1',
      key2: 'updated-value2',
      key3: 'value3',
    })
    expect(finalSpan.metadata).toEqual({
      meta1: 'value1',
      meta2: 'value2',
    })
    expect(finalSpan.modelParameters).toEqual({
      param1: 'value1',
      param2: 'value2',
    })
    expect(finalSpan.parameters).toEqual({
      custom1: 'value1',
      custom2: 'value2',
    })
  })

  it('should merge array fields when inserting duplicate spans', async () => {
    const traceId = 'trace-2'
    const spanId = 'span-2'
    const baseSpan = {
      traceId,
      spanId,
      name: 'test-span',
      kind: SpanKind.Client,
      startTime: new Date(),
    }

    const tool1: ToolCall = {
      id: 'tool1',
      name: 'tool1',
      arguments: { arg: 'value1' },
    }
    const tool2: ToolCall = {
      id: 'tool2',
      name: 'tool2',
      arguments: { arg: 'value2' },
    }
    const event1 = { name: 'event1', timestamp: '2024-01-01T00:00:00Z' }
    const event2 = { name: 'event2', timestamp: '2024-01-01T00:00:01Z' }
    const link1 = { traceId: 'trace-a', spanId: 'span-a' }
    const link2 = { traceId: 'trace-b', spanId: 'span-b' }

    // First insertion
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          tools: [tool1],
          events: [event1],
          links: [link1],
        },
      ],
    })

    // Second insertion
    const result2 = await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          tools: [tool2],
          events: [event2],
          links: [link2],
        },
      ],
    })

    const finalSpan = result2.unwrap().spans[0]!
    expect(finalSpan.tools).toEqual([tool1, tool2])
    expect(finalSpan.events).toEqual([event1, event2])
    expect(finalSpan.links).toEqual([link1, link2])
  })

  it('should only update numeric fields if current value is 0', async () => {
    const traceId = 'trace-3'
    const spanId = 'span-3'
    const baseSpan = {
      traceId,
      spanId,
      name: 'test-span',
      kind: SpanKind.Client,
      startTime: new Date(),
    }

    // First insertion with non-zero values
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300,
          inputCostInMillicents: 400,
          outputCostInMillicents: 500,
          totalCostInMillicents: 900,
        },
      ],
    })

    // Second insertion with different values
    const result2 = await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          inputTokens: 150,
          outputTokens: 250,
          totalTokens: 400,
          inputCostInMillicents: 450,
          outputCostInMillicents: 550,
          totalCostInMillicents: 1000,
        },
      ],
    })

    const finalSpan = result2.unwrap().spans[0]!
    // Should keep original values since they were non-zero
    expect(finalSpan.inputTokens).toBe(100)
    expect(finalSpan.outputTokens).toBe(200)
    expect(finalSpan.totalTokens).toBe(300)
    expect(finalSpan.inputCostInMillicents).toBe(400)
    expect(finalSpan.outputCostInMillicents).toBe(500)
    expect(finalSpan.totalCostInMillicents).toBe(900)

    // Now test updating zero values
    const traceId2 = 'trace-4'
    const spanId2 = 'span-4'

    // First insertion with zero values
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId: traceId2, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          traceId: traceId2,
          spanId: spanId2,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCostInMillicents: 0,
          outputCostInMillicents: 0,
          totalCostInMillicents: 0,
        },
      ],
    })

    // Second insertion with non-zero values
    const result3 = await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId: traceId2, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          traceId: traceId2,
          spanId: spanId2,
          inputTokens: 150,
          outputTokens: 250,
          totalTokens: 400,
          inputCostInMillicents: 450,
          outputCostInMillicents: 550,
          totalCostInMillicents: 1000,
        },
      ],
    })

    const updatedSpan = result3.unwrap().spans[0]!
    // Should update to new values since originals were zero
    expect(updatedSpan.inputTokens).toBe(150)
    expect(updatedSpan.outputTokens).toBe(250)
    expect(updatedSpan.totalTokens).toBe(400)
    expect(updatedSpan.inputCostInMillicents).toBe(450)
    expect(updatedSpan.outputCostInMillicents).toBe(550)
    expect(updatedSpan.totalCostInMillicents).toBe(1000)
  })

  it('should handle null values correctly when merging JSON fields', async () => {
    const traceId = 'trace-6'
    const spanId = 'span-6'
    const baseSpan = {
      traceId,
      spanId,
      name: 'test-span',
      kind: SpanKind.Client,
      startTime: new Date(),
    }

    // First insertion with some null fields
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          attributes: { key1: 'value1' },
          metadata: null,
          modelParameters: { param1: 'value1' },
          parameters: null,
        },
      ],
    })

    // Second insertion with values for previously null fields
    const result2 = await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          attributes: null,
          metadata: { meta1: 'value1' },
          modelParameters: null,
          parameters: { custom1: 'value1' },
        },
      ],
    })

    const finalSpan = result2.unwrap().spans[0]!
    expect(finalSpan.attributes).toEqual({ key1: 'value1' })
    expect(finalSpan.metadata).toEqual({ meta1: 'value1' })
    expect(finalSpan.modelParameters).toEqual({ param1: 'value1' })
    expect(finalSpan.parameters).toEqual({ custom1: 'value1' })
  })

  it('should handle empty arrays when merging array fields', async () => {
    const traceId = 'trace-7'
    const spanId = 'span-7'
    const baseSpan = {
      traceId,
      spanId,
      name: 'test-span',
      kind: SpanKind.Client,
      startTime: new Date(),
    }

    const tool1: ToolCall = {
      id: 'tool1',
      name: 'tool1',
      arguments: { arg: 'value1' },
    }

    // First insertion with empty arrays
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          tools: [],
          events: null,
          links: [],
        },
      ],
    })

    // Second insertion with non-empty arrays
    const result2 = await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          tools: [tool1],
          events: [{ name: 'event1', timestamp: '2024-01-01T00:00:00Z' }],
          links: null,
        },
      ],
    })

    const finalSpan = result2.unwrap().spans[0]!
    expect(finalSpan.tools).toEqual([tool1])
    expect(finalSpan.events).toEqual([
      { name: 'event1', timestamp: '2024-01-01T00:00:00Z' },
    ])
    expect(finalSpan.links).toEqual([])
  })

  it('should handle duplicate elements in array fields', async () => {
    const traceId = 'trace-8'
    const spanId = 'span-8'
    const baseSpan = {
      traceId,
      spanId,
      name: 'test-span',
      kind: SpanKind.Client,
      startTime: new Date(),
    }

    const tool1: ToolCall = {
      id: 'tool1',
      name: 'tool1',
      arguments: { arg: 'value1' },
    }
    const event1 = { name: 'event1', timestamp: '2024-01-01T00:00:00Z' }

    // First insertion
    await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          tools: [tool1],
          events: [event1, event1], // Duplicate event
        },
      ],
    })

    // Second insertion with same elements
    const result2 = await bulkCreateTracesAndSpans({
      workspace,
      traces: [{ traceId, startTime: new Date() }],
      spans: [
        {
          ...baseSpan,
          tools: [tool1], // Same tool
          events: [event1], // Same event
        },
      ],
    })

    const finalSpan = result2.unwrap().spans[0]!
    // Should deduplicate arrays
    expect(finalSpan.tools).toEqual([tool1])
    expect(finalSpan.events).toEqual([event1])
  })
})
