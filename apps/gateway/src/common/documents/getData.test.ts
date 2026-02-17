import { describe, expect, it, vi } from 'vitest'
import { getData } from './getData'

const mocks = vi.hoisted(() => ({
  findProjectById: vi.fn(),
  getCommitByUuid: vi.fn(),
  getDocumentByPath: vi.fn(),
}))

vi.mock('@latitude-data/core/queries/projects/findById', () => ({
  findProjectById: mocks.findProjectById,
}))

vi.mock('@latitude-data/core/repositories', () => {
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
    CommitsRepository,
    DocumentVersionsRepository,
  }
})

describe('getData', () => {
  it('returns BadRequestError for malformed version uuid without hitting DB', async () => {
    mocks.findProjectById.mockResolvedValueOnce({ id: 123 })

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
