import { Workspace } from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import { createProject } from '@latitude-data/core/factories'
import app from '$/routes/app'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as jobsModule from '@latitude-data/core/jobs'

const mocks = vi.hoisted(() => ({
  queues: {
    defaultQueue: {
      jobs: {
        enqueueProcessOtlpTracesJob: vi.fn(),
      },
    },
    eventsQueue: {
      jobs: {
        enqueueCreateEventJob: vi.fn(),
        enqueuePublishEventJob: vi.fn(),
        enqueuePublishToAnalyticsJob: vi.fn(),
        enqueueProcessWebhookJob: vi.fn(),
      },
    },
  },
}))

// Replace the mock setup with spies
// @ts-ignore
vi.spyOn(jobsModule, 'setupQueues').mockResolvedValue(mocks.queues)

describe('POST /api/v2/otlp/v1/traces', () => {
  let workspace: Workspace
  let route: string
  let headers: Record<string, string>

  beforeEach(async () => {
    vi.clearAllMocks()
    const setup = await createProject()
    workspace = setup.workspace

    const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
      workspaceId: workspace.id,
    }).then((r) => r.unwrap())

    route = '/api/v2/otlp/v1/traces'
    headers = {
      Authorization: `Bearer ${apikey.token}`,
      'Content-Type': 'application/json',
    }
  })

  const createBasicSpan = (traceId: string, spanId: string) => ({
    traceId,
    spanId,
    name: 'test-span',
    kind: 1,
    startTimeUnixNano: (Date.now() * 1_000_000).toString(),
    endTimeUnixNano: (Date.now() * 1_000_000 + 1_000_000_000).toString(),
    attributes: [{ key: 'test.attribute', value: { stringValue: 'test' } }],
    status: { code: 1, message: 'Success' },
  })

  const createOtlpRequest = (spans: any[]) => ({
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
        scopeSpans: [{ spans }],
      },
    ],
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

    it('returns 401 with invalid auth token', async () => {
      const response = await app.request(route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify({ resourceSpans: [] }),
      })

      expect(response.status).toBe(401)
    })
  })

  describe('when authorized', () => {
    it('processes single span successfully', async () => {
      const span = createBasicSpan(
        '12345678901234567890123456789012',
        '1234567890123456',
      )

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify(createOtlpRequest([span])),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
      expect(
        mocks.queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob,
      ).toHaveBeenCalledTimes(1)
      expect(
        mocks.queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob,
      ).toHaveBeenCalledWith({
        spans: [
          {
            span: expect.objectContaining({
              spanId: '1234567890123456',
              traceId: '12345678901234567890123456789012',
            }),
            resourceAttributes: expect.arrayContaining([
              expect.objectContaining({
                key: 'service.name',
                value: { stringValue: 'test-service' },
              }),
            ]),
          },
        ],
        workspace: expect.objectContaining({ id: workspace.id }),
      })
    })

    it('handles batch of spans', async () => {
      const spans = Array.from({ length: 10 }, (_, i) =>
        createBasicSpan(
          '12345678901234567890123456789012',
          i.toString(16).padStart(16, '0'),
        ),
      )

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify(createOtlpRequest(spans)),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
      expect(
        mocks.queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob,
      ).toHaveBeenCalledTimes(1)
      expect(
        mocks.queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob,
      ).toHaveBeenCalledWith({
        spans: expect.arrayContaining([
          expect.objectContaining({
            span: expect.objectContaining({ spanId: '0000000000000000' }),
          }),
        ]),
        workspace: expect.objectContaining({ id: workspace.id }),
      })
    })

    it('processes multiple traces', async () => {
      const spans = Array.from({ length: 3 }, (_, i) =>
        createBasicSpan(
          `${'0'.repeat(29)}${(i + 1).toString().padStart(3, '0')}`,
          i.toString(16).padStart(16, '0'),
        ),
      )

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify(createOtlpRequest(spans)),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
      expect(
        mocks.queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob,
      ).toHaveBeenCalledTimes(1)
    })

    it('handles empty spans array', async () => {
      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify(createOtlpRequest([])),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
      expect(
        mocks.queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob,
      ).not.toHaveBeenCalled()
    })

    it('processes spans in batches when exceeding batch size', async () => {
      const spans = Array.from({ length: 75 }, (_, i) =>
        createBasicSpan(
          '12345678901234567890123456789012',
          i.toString(16).padStart(16, '0'),
        ),
      )

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify(createOtlpRequest(spans)),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
      // With BATCH_SIZE = 50, we expect 2 batches (50 + 25 spans)
      expect(
        mocks.queues.defaultQueue.jobs.enqueueProcessOtlpTracesJob,
      ).toHaveBeenCalledTimes(2)
    })

    it('returns 400 for invalid OTLP data', async () => {
      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: {
                attributes: [{ invalid: 'data' }],
              },
              scopeSpans: [{ spans: [{ invalid: 'span' }] }],
            },
          ],
        }),
      })

      expect(response.status).toBe(400)
    })
  })
})
