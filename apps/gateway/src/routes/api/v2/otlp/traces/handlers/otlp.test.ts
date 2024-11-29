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
    projectId: project.id,
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

  describe('when authorized', () => {
    it('processes single span', async () => {
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
