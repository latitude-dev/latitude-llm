import { Providers, User, Workspace } from '@latitude-data/core/browser'
import {
  createDocumentLog,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('GET handler for documentLogs/uuids/[uuid]', () => {
  let workspace: Workspace
  let user: User
  let documentLogUuid: string

  beforeEach(async () => {
    const setup = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        wat: helpers.createPrompt({ provider: 'openai' }),
      },
    })
    workspace = setup.workspace
    user = setup.user
    const documentVersion = setup.documents[0]
    const commit = setup.commit

    const { documentLog } = await createDocumentLog({
      document: documentVersion!,
      commit,
    })
    documentLogUuid = documentLog.uuid
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      mocks.getSession.mockReturnValue(null)

      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: { uuid: documentLogUuid },
        workspace,
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockReturnValue({ user })
    })

    it('should return 404 if document log is not found', async () => {
      const uuid = generateUUIDIdentifier()
      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: { uuid },
        workspace,
      })

      expect(response.status).toBe(404)
    })

    it('should return document log when found', async () => {
      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: { uuid: documentLogUuid },
        workspace,
      })

      const result = await response.json()
      expect(response.status).toBe(200)
      expect(result).toHaveProperty('uuid', documentLogUuid)
    })
  })
})
