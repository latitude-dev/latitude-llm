import app from '$/routes/app'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createApiKey,
  createDraft,
  createProject,
} from '@latitude-data/core/factories'

describe('POST /projects/:projectId/versions/:commitUuid/push', () => {
  describe('when unauthorized', () => {
    it('fails with 401', async () => {
      const response = await app.request(
        '/api/v3/projects/1/versions/commit-uuid/push',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            changes: [
              {
                path: 'document-path',
                content: 'content',
                status: 'added',
              },
            ],
          }),
        },
      )

      expect(response.status).toBe(401)
    })
  })

  describe('when authorized', () => {
    let headers: Record<string, string>
    let project: any
    let commit: any
    let route: string

    beforeEach(async () => {
      const { workspace: w, project: p, user } = await createProject()
      project = p

      const { commit: c } = await createDraft({ project: p, user })
      commit = c

      route = `/api/v3/projects/${project.id}/versions/${commit.uuid}/push`

      const { apiKey } = await createApiKey({ workspace: w, name: 'wat' })

      headers = {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      }
    })

    it('successfully processes valid push changes', async () => {
      const changes = [
        {
          path: 'document1',
          content: 'document content',
          status: 'added',
        },
        {
          path: 'document2',
          content: 'document content 2',
          status: 'modified',
        },
      ]

      const response = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({ changes }),
      })

      expect(response.status).toBe(200)

      const responseData = await response.json()
      expect(responseData).toEqual({
        commitUuid: commit.uuid,
      })
    })
  })
})
