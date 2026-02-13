import { describe, expect, it, vi } from 'vitest'

vi.mock('$/middlewares/authHandler', () => ({
  authHandler: (fn: unknown) => fn,
}))

vi.mock('$/middlewares/errorHandler', () => ({
  errorHandler: (fn: unknown) => fn,
}))

const listByEvaluationMock = vi.fn()
const getCommitByUuidMock = vi.fn()

vi.mock('@latitude-data/core/repositories', () => {
  return {
    CommitsRepository: class {
      constructor(_: number) {}
      getCommitByUuid = getCommitByUuidMock
    },
    EvaluationResultsV2Repository: class {
      constructor(_: number) {}
      listByEvaluation = listByEvaluationMock
    },
  }
})

vi.mock('@latitude-data/core/helpers', () => ({
  evaluationResultsV2SearchFromQueryParams: () => ({
    filters: {},
    orders: {},
    pagination: { page: 1, pageSize: 25 },
  }),
}))

describe('evaluation results route', () => {
  it('defaults commitIds filter to current commit when absent', async () => {
    getCommitByUuidMock.mockResolvedValue({
      unwrap: () => ({ id: 123 }),
    })

    listByEvaluationMock.mockResolvedValue({
      unwrap: () => [],
    })

    const { GET } = await import('./route')

    await GET(
      {
        nextUrl: { searchParams: new URLSearchParams() },
      } as any,
      {
        params: {
          projectId: 1,
          commitUuid: 'commit-uuid',
          documentUuid: 'doc-uuid',
          evaluationUuid: 'eval-uuid',
        },
        workspace: { id: 999 },
      } as any,
    )

    expect(getCommitByUuidMock).toHaveBeenCalledWith({
      projectId: 1,
      uuid: 'commit-uuid',
    })

    expect(listByEvaluationMock).toHaveBeenCalledWith({
      evaluationUuid: 'eval-uuid',
      params: expect.objectContaining({
        filters: expect.objectContaining({ commitIds: [123] }),
      }),
    })
  })
})
