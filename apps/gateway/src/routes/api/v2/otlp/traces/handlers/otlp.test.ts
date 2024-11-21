import { Project, Workspace } from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import { createProject } from '@latitude-data/core/factories'
import app from '$/routes/app'
import { beforeEach, describe, expect, it } from 'vitest'

describe('POST /api/v2/otlp/v1/traces', () => {
  let workspace: Workspace
  let project: Project
  let route: string
  let headers: Record<string, string>

  beforeEach(async () => {
    const setup = await createProject()
    workspace = setup.workspace
    project = setup.project

    const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
      workspaceId: workspace.id,
    }).then((r) => r.unwrap())

    route = '/api/v2/otlp/v1/traces'
    headers = {
      Authorization: `Bearer ${apikey.token}`,
      'Content-Type': 'application/json',
    }
  })

  describe('when authorized', () => {
    it('processes OTLP trace data', async () => {
      const traceId = '12345678901234567890123456789012'
      const spanId = '1234567890123456'
      const startTime = Date.now() * 1_000_000 // Convert to nano
      const endTime = startTime + 1_000_000_000 // 1 second later in nano

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: {
                attributes: [
                  {
                    key: 'service.name',
                    value: { stringValue: 'test-service' },
                  },
                ],
              },
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId,
                      spanId,
                      name: 'test-span',
                      kind: 1, // SERVER
                      startTimeUnixNano: startTime.toString(),
                      endTimeUnixNano: endTime.toString(),
                      attributes: [
                        {
                          key: 'http.method',
                          value: { stringValue: 'GET' },
                        },
                      ],
                      status: {
                        code: 1, // OK
                        message: 'Success',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      })

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result).toEqual({ status: 'ok' })
    })

    it('handles large batches of spans efficiently', async () => {
      const traceId = '12345678901234567890123456789012'
      const startTime = Date.now() * 1_000_000

      // Create test data with multiple spans
      const spans = Array.from({ length: 100 }, (_, i) => ({
        traceId,
        spanId: `span${i.toString().padStart(16, '0')}`,
        name: `span-${i}`,
        kind: 1,
        startTimeUnixNano: startTime.toString(),
        attributes: [
          {
            key: 'test.index',
            value: { intValue: i },
          },
        ],
        status: {
          code: 1,
          message: 'Success',
        },
      }))

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: {
                attributes: [
                  {
                    key: 'service.name',
                    value: { stringValue: 'test-service' },
                  },
                ],
              },
              scopeSpans: [
                {
                  spans,
                },
              ],
            },
          ],
        }),
      })

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result).toEqual({ status: 'ok' })
    })

    it('processes multiple traces in parallel', async () => {
      const traces = Array.from({ length: 3 }, (_, i) => ({
        traceId: `trace${i.toString().padStart(29, '0')}123`,
        spans: Array.from({ length: 5 }, (_, j) => ({
          traceId: `trace${i.toString().padStart(29, '0')}123`,
          spanId: `span${j.toString().padStart(16, '0')}`,
          name: `span-${i}-${j}`,
          kind: 1,
          startTimeUnixNano: (Date.now() * 1_000_000).toString(),
        })),
      }))

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: {
                attributes: [
                  {
                    key: 'service.name',
                    value: { stringValue: 'test-service' },
                  },
                ],
              },
              scopeSpans: traces.map((trace) => ({
                spans: trace.spans,
              })),
            },
          ],
        }),
      })

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result).toEqual({ status: 'ok' })
    })
  })

  describe('when unauthorized', () => {
    it('returns 401 without auth token', async () => {
      const response = await app.request(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceSpans: [] }),
      })

      expect(response.status).toBe(401)
    })
  })
})
