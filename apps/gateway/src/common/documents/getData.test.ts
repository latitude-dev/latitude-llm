import { describe, expect, it, vi } from 'vitest'
import { Result } from '@latitude-data/core/lib/Result'

import { getData } from './getData'

const mocks = vi.hoisted(() => ({
  getProjectById: vi.fn(),
  getCommitByUuid: vi.fn(),
  getDocumentByPath: vi.fn(),
}))

vi.mock('@latitude-data/core/repositories', () => {
  class ProjectsRepository {
    constructor(_workspaceId: number) {
      void _workspaceId
    }
    getProjectById = mocks.getProjectById
  }

  class CommitsRepository {
    constructor(_workspaceId: number) {
      void _workspaceId
    }
    getCommitByUuid = mocks.getCommitByUuid
  }

  class DocumentVersionsRepository {
    constructor(_workspaceId: number) {
      void _workspaceId
    }
    getDocumentByPath = mocks.getDocumentByPath
  }

  return {
    ProjectsRepository,
    CommitsRepository,
    DocumentVersionsRepository,
    ProviderApiKeysRepository: class {},
  }
})

describe('getData', () => {
  it('returns BadRequestError for malformed version uuid without hitting DB', async () => {
    mocks.getProjectById.mockResolvedValueOnce(Result.ok({ id: 123 }))

    const res = await getData({
      workspace: { id: 1 } as any,
      projectId: 123,
      commitUuid: 'invalid-uuid',
      documentPath: 'docs/test',
    })

    expect(res.error).toBeTruthy()
    expect(res.value).toBeUndefined()
    expect(res.error?.name).toBe('BadRequestError')
    expect(res.error?.message).toBe('Invalid version uuid invalid-uuid')

    expect(mocks.getCommitByUuid).not.toHaveBeenCalled()
    expect(mocks.getDocumentByPath).not.toHaveBeenCalled()
  })
})
