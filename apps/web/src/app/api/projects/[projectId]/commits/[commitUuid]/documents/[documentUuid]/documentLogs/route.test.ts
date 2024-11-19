import { RunErrorCodes } from '@latitude-data/constants/errors'
import {
  Commit,
  DocumentVersion,
  ErrorableEntity,
  Project,
  Providers,
  User,
  WorkspaceDto,
} from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { createRunError } from '@latitude-data/core/services/runErrors/create'
import { NextRequest, NextResponse } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET, type ResponseResult } from './route'

type GetResponse = NextResponse<ResponseResult<true>>

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
  let mockResponse: GetResponse = {} as unknown as GetResponse
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
      const response = await GET(mockRequest, mockResponse, {
        workspace,
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        details: {},
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockReturnValue({ user })
    })

    it('should return all logs', async () => {
      const response = await GET(mockRequest, mockResponse, {
        params: {
          projectId: String(project.id),
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
      mockRequest = new NextRequest('http://localhost:3000?page=0')
      const response = await GET(mockRequest, mockResponse, {
        params: {
          projectId: String(project.id),
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

      const response = await GET(mockRequest, mockResponse, {
        params: {
          projectId: String(project.id),
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
      const response = await GET(mockRequest, mockResponse, {
        params: {
          projectId: String(project.id),
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
