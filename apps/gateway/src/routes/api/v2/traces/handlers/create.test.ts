import { Project, Workspace } from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import { createProject } from '@latitude-data/core/factories'
import app from '$/routes/app'
import { beforeEach, describe, expect, it } from 'vitest'

describe('POST /api/v2/traces', () => {
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

    route = '/api/v2/traces'
    headers = {
      Authorization: `Bearer ${apikey.token}`,
      'Content-Type': 'application/json',
    }
  })

  describe('when authorized', () => {
    it('creates a trace with all fields', async () => {
      const traceId = '12345678901234567890123456789012' // 32 chars
      const startTime = new Date()
      const endTime = new Date(startTime.getTime() + 1000) // 1 second later
      const attributes = { foo: 'bar', count: 123, flag: true }

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          traceId,
          name: 'Test Trace',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          attributes,
          status: 'ok',
        }),
      })

      expect(response.status).toBe(200)
      const trace = await response.json()

      expect(trace).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          projectId: project.id,
          traceId,
          name: 'Test Trace',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          attributes,
          status: 'ok',
        }),
      )
    })

    it('creates a trace with minimal fields', async () => {
      const traceId = '12345678901234567890123456789012'
      const startTime = new Date()

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          traceId,
          startTime: startTime.toISOString(),
        }),
      })

      expect(response.status).toBe(200)
      const trace = await response.json()

      expect(trace).toEqual(
        expect.objectContaining({
          projectId: project.id,
          traceId,
          startTime: startTime.toISOString(),
          name: null,
          attributes: null,
          status: null,
        }),
      )
    })

    it('fails with invalid traceId format', async () => {
      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          traceId: 'invalid-trace-id',
          startTime: new Date().toISOString(),
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
          projectId: project.id,
          traceId: '12345678901234567890123456789012',
          startTime: new Date().toISOString(),
        }),
      })

      expect(response.status).toBe(401)
    })
  })
})
