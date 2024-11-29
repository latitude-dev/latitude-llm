import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { database } from '../../client'
import { SpanKind } from '../../constants'
import { spans } from '../../schema/models/spans'
import * as factories from '../../tests/factories'
import { createTrace } from '../traces/create'
import { bulkCreateSpans } from './bulkCreate'

describe('bulkCreateSpans', () => {
  let traceId: string

  beforeEach(async () => {
    const setup = await factories.createProject()
    traceId = '12345678901234567890123456789012'
    await createTrace({
      project: setup.project,
      traceId,
      startTime: new Date(),
    })
  })

  it('creates multiple spans', async () => {
    const spanId1 = '1234567890123456'
    const spanId2 = '6543210987654321'
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

    const result = await bulkCreateSpans({
      spans: [
        {
          traceId,
          spanId: spanId1,
          name: 'Test Span 1',
          kind: SpanKind.Internal,
          startTime,
          attributes,
          status: 'ok',
          statusMessage: 'Success',
          events,
          links,
          metadataType: 'default',
          metadataId: 1,
        },
        {
          traceId,
          spanId: spanId2,
          parentSpanId: spanId1,
          name: 'Test Span 2',
          kind: SpanKind.Server,
          startTime,
          endTime: new Date(startTime.getTime() + 1000),
          attributes: { ...attributes, additional: 'value' },
          status: 'error',
          statusMessage: 'Failed',
          metadataType: 'default',
          metadataId: 2,
        },
      ],
    })

    expect(result.error).toBeUndefined()
    const createdSpans = result.value!

    expect(createdSpans).toHaveLength(2)
    expect(createdSpans[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        traceId,
        spanId: spanId1,
        name: 'Test Span 1',
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
    expect(createdSpans[1]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        traceId,
        spanId: spanId2,
        parentSpanId: spanId1,
        name: 'Test Span 2',
        kind: 'server',
        attributes: { ...attributes, additional: 'value' },
        status: 'error',
        statusMessage: 'Failed',
        metadataType: 'default',
        metadataId: 2,
      }),
    )

    // Verify spans were actually inserted in database
    const dbSpans = await database.query.spans.findMany({
      where: eq(spans.traceId, traceId),
    })

    expect(dbSpans).toHaveLength(2)
    expect(dbSpans[0]?.spanId).toBe(spanId1)
    expect(dbSpans[1]?.spanId).toBe(spanId2)
  })

  it('creates spans with minimal required fields', async () => {
    const spanId1 = '1234567890123456'
    const spanId2 = '6543210987654321'
    const startTime = new Date()

    const result = await bulkCreateSpans({
      spans: [
        {
          traceId,
          spanId: spanId1,
          name: 'Test Span 1',
          kind: SpanKind.Internal,
          startTime,
          metadataType: 'default',
          metadataId: 1,
        },
        {
          traceId,
          spanId: spanId2,
          name: 'Test Span 2',
          kind: SpanKind.Internal,
          startTime,
          metadataType: 'default',
          metadataId: 2,
        },
      ],
    })

    expect(result.error).toBeUndefined()
    const createdSpans = result.value!

    expect(createdSpans).toHaveLength(2)
    expect(createdSpans[0]).toEqual(
      expect.objectContaining({
        traceId,
        spanId: spanId1,
        name: 'Test Span 1',
        kind: 'internal',
        startTime,
        attributes: null,
        status: null,
        statusMessage: null,
        events: null,
        links: null,
        metadataType: 'default',
        metadataId: 1,
      }),
    )
    expect(createdSpans[1]).toEqual(
      expect.objectContaining({
        traceId,
        spanId: spanId2,
        name: 'Test Span 2',
        kind: 'internal',
        startTime,
        attributes: null,
        status: null,
        statusMessage: null,
        events: null,
        links: null,
        metadataType: 'default',
        metadataId: 2,
      }),
    )
  })
})
