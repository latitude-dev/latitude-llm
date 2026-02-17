import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import { createProject } from '@latitude-data/core/factories'
import { randomUUID } from 'crypto'
import { beforeAll, describe, expect, it } from 'vitest'

describe('GET /projects/{projectId}/versions/{commitUuid}', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/projects/1/versions/uuid')
      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let headers: Record<string, unknown>
    let projectId: number
    let commitUuid: string

    beforeAll(async () => {
      const { workspace, project, commit } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }

      projectId = project.id
      commitUuid = commit.uuid
    })

    it('gets a commit by uuid', async () => {
      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}`
      const res = await app.request(route, headers)

      expect(res.status).toBe(200)
    })

    it('returns 404 when commit does not exist', async () => {
      const nonExistentUuid = randomUUID()
      const route = `/api/v3/projects/${projectId}/versions/${nonExistentUuid}`
      const res = await app.request(route, headers)

      expect(res.status).toBe(404)
    })
  })
})
