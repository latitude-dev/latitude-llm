import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { SpanMetadataTypes, type Project } from '../../browser'
import { database } from '../../client'
import { spans } from '../../schema/models/spans'
import * as factories from '../../tests/factories'
import { createTrace } from '../traces/create'
import { createSpan } from './create'

describe('createSpan', () => {
  let project: Project
  let traceId: string

  beforeEach(async () => {
    const setup = await factories.createProject()
    project = setup.project

    traceId = '12345678901234567890123456789012'
    await createTrace({
      project,
      traceId,
      startTime: new Date(),
    })
  })

  it('creates a span', async () => {
    const spanId = '1234567890123456' // 16 chars
    const startTime = new Date()
    const attributes = { foo: 'bar', count: 123, flag: true }
    const events = [
      {
        name: 'event1',
        timestamp: new Date().toISOString(),
        attributes: { key: 'value' },
      },
    ]
    const links = [
      {
        traceId: '98765432109876543210987654321098',
        spanId: '9876543210987654',
        attributes: { key: 'value' },
      },
    ]

    const result = await createSpan({
      traceId,
      spanId,
      name: 'Test Span',
      kind: 'internal',
      startTime,
      attributes,
      status: 'ok',
      statusMessage: 'Success',
      events,
      links,
      metadataType: SpanMetadataTypes.Default,
      metadataId: 1,
    })

    expect(result.error).toBeUndefined()
    const span = result.value!

    expect(span).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        traceId,
        spanId,
        name: 'Test Span',
        kind: 'internal',
        startTime,
        attributes,
        status: 'ok',
        statusMessage: 'Success',
        events,
        links,
        metadataType: 'default',
        metadataId: 1,
      }),
    )

    // Verify span was actually inserted in database
    const dbSpan = await database.query.spans.findFirst({
      where: eq(spans.id, span.id),
    })

    expect(dbSpan).toBeDefined()
    expect(dbSpan?.traceId).toBe(traceId)
    expect(dbSpan?.spanId).toBe(spanId)
  })

  it('creates a span with parent span reference', async () => {
    const parentSpanId = '1234567890123456'
    const childSpanId = '6543210987654321'

    // Create parent span
    await createSpan({
      traceId,
      spanId: parentSpanId,
      name: 'Parent Span',
      kind: 'internal',
      startTime: new Date(),
      metadataType: SpanMetadataTypes.Default,
      metadataId: 1,
    })

    // Create child span
    const result = await createSpan({
      traceId,
      spanId: childSpanId,
      parentSpanId: parentSpanId,
      name: 'Child Span',
      kind: 'internal',
      startTime: new Date(),
      metadataType: SpanMetadataTypes.Default,
      metadataId: 2,
    })

    expect(result.error).toBeUndefined()
    const span = result.value!

    expect(span.parentSpanId).toBe(parentSpanId)
  })

  it('fails if spanId is not unique', async () => {
    const spanId = '1234567890123456'
    const startTime = new Date()

    // Create first span
    await createSpan({
      traceId,
      spanId,
      name: 'Test Span',
      kind: 'internal',
      startTime,
      metadataType: SpanMetadataTypes.Default,
      metadataId: 1,
    })

    // Try to create second span with same spanId
    const result = await createSpan({
      traceId,
      spanId,
      name: 'Another Span',
      kind: 'internal',
      startTime,
      metadataType: SpanMetadataTypes.Default,
      metadataId: 2,
    })

    expect(result.error).toBeDefined()
  })
})
