import { SpanMetadataTypes, Workspace } from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import { createProject } from '@latitude-data/core/factories'
import { createTrace } from '@latitude-data/core/services/traces/create'
import app from '$/routes/app'
import { beforeEach, describe, expect, it } from 'vitest'

describe('POST /api/v2/spans', () => {
  let workspace: Workspace
  let traceId: string
  let route: string
  let headers: Record<string, string>

  beforeEach(async () => {
    const setup = await createProject()
    workspace = setup.workspace

    const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
      workspaceId: workspace.id,
    }).then((r) => r.unwrap())

    traceId = '12345678901234567890123456789012'
    await createTrace({
      project: setup.project,
      traceId,
      startTime: new Date(),
    })

    route = '/api/v2/spans'
    headers = {
      Authorization: `Bearer ${apikey.token}`,
      'Content-Type': 'application/json',
    }
  })

  describe('when authorized', () => {
    it('creates a span with all fields', async () => {
      const spanId = '1234567890123456' // 16 chars
      const startTime = new Date()
      const endTime = new Date(startTime.getTime() + 1000) // 1 second later
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

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          traceId,
          spanId,
          name: 'Test Span',
          kind: 'internal',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          attributes,
          status: 'ok',
          statusMessage: 'Success',
          events,
          links,
          metadataType: SpanMetadataTypes.Default,
          metadataId: 1,
        }),
      })

      expect(response.status).toBe(200)
      const span = await response.json()

      expect(span).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          traceId,
          spanId,
          name: 'Test Span',
          kind: 'internal',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          attributes,
          status: 'ok',
          statusMessage: 'Success',
          events,
          links,
          metadataType: 'default',
          metadataId: 1,
        }),
      )
    })

    it('creates a span with parent span reference', async () => {
      const parentSpanId = '1234567890123456'
      const childSpanId = '6543210987654321'
      const startTime = new Date()

      // Create parent span
      await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          traceId,
          spanId: parentSpanId,
          name: 'Parent Span',
          kind: 'internal',
          startTime: startTime.toISOString(),
          metadataType: SpanMetadataTypes.Default,
          metadataId: 1,
        }),
      })

      // Create child span
      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          traceId,
          spanId: childSpanId,
          parentSpanId: parentSpanId,
          name: 'Child Span',
          kind: 'internal',
          startTime: startTime.toISOString(),
          metadataType: SpanMetadataTypes.Default,
          metadataId: 2,
        }),
      })

      expect(response.status).toBe(200)
      const span = await response.json()

      expect(span.parentSpanId).toBe(parentSpanId)
    })

    it('fails with invalid spanId format', async () => {
      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          traceId,
          spanId: 'invalid-span-id',
          name: 'Test Span',
          kind: 'internal',
          startTime: new Date().toISOString(),
          metadataType: SpanMetadataTypes.Default,
          metadataId: 1,
        }),
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when unauthorized', () => {
    it('returns 401 without auth token', async () => {
      const response = await app.request(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId,
          spanId: '1234567890123456',
          name: 'Test Span',
          kind: 'internal',
          startTime: new Date().toISOString(),
          metadataType: SpanMetadataTypes.Default,
          metadataId: 1,
        }),
      })

      expect(response.status).toBe(401)
    })
  })
})
