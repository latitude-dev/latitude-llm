import { RunErrorCodes } from '@latitude-data/constants/errors'
import * as factories from '@latitude-data/core/factories'
import { createRunError } from '@latitude-data/core/services/runErrors/create'
import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'
import { ErrorableEntity, LOG_SOURCES } from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { User } from '@latitude-data/core/schema/models/types/User'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Providers } from '@latitude-data/constants'

const LOG_SOURCES_LIST = LOG_SOURCES.join(',')
const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('GET logs', () => {
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let workspace: WorkspaceDto
  let mockRequest: NextRequest
  let user: User

  beforeAll(async () => {
    mockRequest = new NextRequest('http://localhost:3000')
    const {
      workspace: wps,
      project: prj,
      documents: [doc],
      commit: cmt,
      user: usr,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    workspace = wps as WorkspaceDto
    commit = cmt
    document = doc!
    project = prj
    user = usr
    const { documentLog } = await factories.createDocumentLog({
      document,
      commit,
    })
    await createRunError({
      data: {
        errorableType: ErrorableEntity.DocumentLog,
        errorableUuid: documentLog.uuid,
        code: RunErrorCodes.Unknown,
        message: 'Error message',
      },
    })
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      const response = await GET(mockRequest, {
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
      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    it('should return all logs', async () => {
      const qp = `commitIds=${commit.id}&logSources=${LOG_SOURCES_LIST}`
      const mockURL = new NextRequest(`http://localhost:3000?${qp}`)
      const response = await GET(mockURL, {
        params: {
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        },
        workspace,
        user,
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toEqual(1)
      expect(data).toEqual([
        expect.objectContaining({
          error: expect.objectContaining({
            code: RunErrorCodes.Unknown,
            message: 'Error message',
          }),
        }),
      ])
    })

    it('should should not fail with page=0', async () => {
      const qp = `page=0&commitIds=${commit.id}&logSources=${LOG_SOURCES_LIST}`
      const mockURL = new NextRequest(`http://localhost:3000?${qp}`)
      const response = await GET(mockURL, {
        params: {
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        },
        workspace,
        user,
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toEqual(1)
    })

    it('returns logs scoped by workspace', async () => {
      const {
        documents: [document2],
        commit: commit2,
      } = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          bar: factories.helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })

      await factories.createDocumentLog({
        document: document2!,
        commit: commit2,
      })

      const qp = `commitIds=${commit.id}&logSources=${LOG_SOURCES_LIST}`
      const mockURL = new NextRequest(`http://localhost:3000?${qp}`)
      const response = await GET(mockURL, {
        params: {
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        },
        workspace,
        user,
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toEqual(1)
    })

    it('should exclude logs with errors', async () => {
      mockRequest = new NextRequest('http://localhost:3000?excludeErrors=true')
      const response = await GET(mockRequest, {
        params: {
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        },
        workspace,
        user,
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toEqual(0)
    })
  })
})
