import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import { createProject } from '@latitude-data/core/factories'
import { randomUUID } from 'crypto'
import { beforeAll, describe, expect, it } from 'vitest'

describe('GET /projects/{projectId}/commits/{commitUuid}', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request('/api/v3/projects/1/commits/uuid')
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
      }).then((r) => r.unwrap())

      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }

      projectId = project.id
      commitUuid = commit.uuid
    })

    it('gets a commit by uuid', async () => {
      const route = `/api/v3/projects/${projectId}/commits/${commitUuid}`
      const res = await app.request(route, headers)

      expect(res.status).toBe(200)
    })

    it('returns 404 when commit does not exist', async () => {
      const nonExistentUuid = randomUUID()
      const route = `/api/v3/projects/${projectId}/commits/${nonExistentUuid}`
      const res = await app.request(route, headers)

      expect(res.status).toBe(404)
    })
  })
})
