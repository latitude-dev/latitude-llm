import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getData } from './getData'

const mocks = vi.hoisted(() => ({
  findProjectById: vi.fn(),
  getCommitByUuid: vi.fn(),
  getDocumentByPath: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}))

vi.mock('@latitude-data/core/cache', () => ({
  cache: vi.fn().mockResolvedValue({
    get: mocks.cacheGet,
    set: mocks.cacheSet,
  }),
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns BadRequestError for malformed version uuid without hitting DB', async () => {
    mocks.findProjectById.mockResolvedValueOnce({ id: 123 })
    mocks.cacheGet.mockResolvedValueOnce(null)

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

  it('hydrates date fields from cached values', async () => {
    const now = new Date()
    mocks.cacheGet.mockResolvedValueOnce(
      JSON.stringify({
        project: {
          id: 123,
          name: 'Project',
          lastEditedAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          workspaceId: 1,
        },
        commit: {
          id: 456,
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          projectId: 123,
          title: 'Commit',
          description: null,
          mainDocumentUuid: null,
          version: null,
          userId: 'user',
          mergedAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
        document: {
          id: 789,
          commitId: 456,
          documentUuid: '223e4567-e89b-12d3-a456-426614174000',
          path: 'prompt/path',
          content: 'Hello',
          resolvedContent: null,
          contentHash: null,
          promptlVersion: 0,
          documentType: 'agent',
          datasetId: null,
          datasetV2Id: null,
          linkedDataset: {},
          linkedDatasetAndRow: {},
          mainEvaluationUuid: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      }),
    )

    const res = await getData({
      workspace: { id: 1 } as any,
      projectId: 123,
      commitUuid: '123e4567-e89b-12d3-a456-426614174000',
      documentPath: 'prompt/path',
    })

    expect(res.error).toBeUndefined()
    expect((res.value as any).project.createdAt).toBeInstanceOf(Date)
    expect((res.value as any).project.lastEditedAt).toBeInstanceOf(Date)
    expect((res.value as any).commit.createdAt).toBeInstanceOf(Date)
    expect((res.value as any).commit.mergedAt).toBeInstanceOf(Date)
    expect((res.value as any).document.createdAt).toBeInstanceOf(Date)
    expect(mocks.getCommitByUuid).not.toHaveBeenCalled()
    expect(mocks.getDocumentByPath).not.toHaveBeenCalled()
  })
})
