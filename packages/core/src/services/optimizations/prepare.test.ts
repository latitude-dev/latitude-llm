import { Providers, SpanType, SpanWithDetails } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import * as getSpansByIssueModule from '../../data-access/issues/getSpansByIssue'
import * as getSpansWithoutIssuesModule from '../../data-access/issues/getSpansWithoutIssues'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import {
  DatasetRowsRepository,
  DatasetsRepository,
  IssuesRepository,
  SpanMetadatasRepository,
} from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { Dataset } from '../../schema/models/types/Dataset'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { Optimization } from '../../schema/models/types/Optimization'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { prepareOptimization } from './prepare'

const mocks = vi.hoisted(() => ({
  optimizationsQueue: vi.fn(),
}))

vi.mock('../../jobs/queues', () => ({
  queues: vi.fn().mockResolvedValue({
    optimizationsQueue: {
      add: mocks.optimizationsQueue,
    },
  }),
}))

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('prepareOptimization', () => {
  let publisherMock: MockInstance

  let workspace: WorkspaceDto
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let user: User
  let trainset: Dataset
  let testset: Dataset

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      workspace: w,
      project: p,
      commit: c,
      documents,
      user: u,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    workspace = w
    project = p
    commit = c
    document = documents[0]!
    user = u

    trainset = await factories
      .createDataset({ workspace, author: user })
      .then((r) => r.dataset)
    testset = await factories
      .createDataset({ workspace, author: user })
      .then((r) => r.dataset)

    publisherMock = vi.mocked(publisher.publishLater)
  })

  it('fails when optimization is already prepared', async () => {
    const preparedOptimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    await expect(
      prepareOptimization({
        optimization: preparedOptimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already prepared'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when optimization is already finished', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      error: 'some error',
    })

    const finishedOptimization = {
      ...optimization,
      finishedAt: new Date(),
    } as Optimization

    await expect(
      prepareOptimization({
        optimization: finishedOptimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already ended'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('prepares optimization with existing trainset and testset', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const unpreparedOptimization = {
      ...optimization,
      preparedAt: null,
    } as Optimization

    const result = await prepareOptimization({
      optimization: unpreparedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.preparedAt).not.toBeNull()
    expect(result.optimization.trainsetId).toBe(trainset.id)
    expect(result.optimization.testsetId).toBe(testset.id)
    expect(result.trainset).toBeDefined()
    expect(result.testset).toBeDefined()

    expect(mocks.optimizationsQueue).toHaveBeenCalledTimes(1)
    expect(mocks.optimizationsQueue).toHaveBeenCalledWith(
      'executeOptimizationJob',
      {
        workspaceId: workspace.id,
        optimizationId: result.optimization.id,
      },
      expect.objectContaining({
        jobId: expect.stringContaining('executeOptimizationJob'),
        attempts: 1,
        deduplication: expect.any(Object),
      }),
    )

    expect(publisherMock).toHaveBeenCalledTimes(1)
    expect(publisherMock).toHaveBeenCalledWith({
      type: 'optimizationPrepared',
      data: {
        workspaceId: workspace.id,
        optimizationId: result.optimization.id,
      },
    })
  })

  it('updates timestamps correctly when prepared', async () => {
    const optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    const unpreparedOptimization = {
      ...optimization,
      preparedAt: null,
    } as Optimization

    const beforePrepare = new Date()

    const result = await prepareOptimization({
      optimization: unpreparedOptimization,
      workspace,
    }).then((r) => r.unwrap())

    const afterPrepare = new Date()

    expect(result.optimization.preparedAt).not.toBeNull()
    expect(result.optimization.preparedAt!.getTime()).toBeGreaterThanOrEqual(
      beforePrepare.getTime(),
    )
    expect(result.optimization.preparedAt!.getTime()).toBeLessThanOrEqual(
      afterPrepare.getTime(),
    )
    expect(result.optimization.updatedAt.getTime()).toBeGreaterThanOrEqual(
      beforePrepare.getTime(),
    )
    expect(result.optimization.updatedAt.getTime()).toBeLessThanOrEqual(
      afterPrepare.getTime(),
    )
  })

  describe('dataset generation from spans', () => {
    let getSpansByIssueMock: MockInstance
    let getSpansWithoutIssuesMock: MockInstance
    let issuesRepositoryMock: MockInstance
    let spanMetadatasGetMock: MockInstance

    let documentWithParams: DocumentVersion
    let commitWithParams: Commit
    let projectWithParams: Project
    let workspaceWithParams: WorkspaceDto

    const spanMetadataStore: Map<
      string,
      { parameters: Record<string, unknown> }
    > = new Map()

    function createMockSpan(
      id: string,
      traceId: string,
      parameters: Record<string, unknown>,
    ): SpanWithDetails<SpanType.Prompt> {
      spanMetadataStore.set(`${traceId}:${id}`, { parameters })

      return {
        id,
        traceId,
        type: SpanType.Prompt,
        metadata: {
          parameters,
        },
      } as SpanWithDetails<SpanType.Prompt>
    }

    function createMockIssue(id: number): Issue {
      return {
        id,
        uuid: `issue-uuid-${id}`,
        workspaceId: workspaceWithParams.id,
        projectId: projectWithParams.id,
        documentUuid: documentWithParams.documentUuid,
        title: `Issue ${id}`,
        description: `Description for issue ${id}`,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        mergedAt: null,
        baselineCommitId: null,
        optimizationId: null,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        escalatingAt: null,
        centroid: { x: 0, y: 0, z: 0 },
        resolvedAt: null,
        ignoredAt: null,
        mergedToIssueId: null,
      } as unknown as Issue
    }

    beforeEach(async () => {
      spanMetadataStore.clear()

      const {
        workspace: w,
        project: p,
        commit: c,
        documents,
      } = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
            content: 'Hello {{inputParam}}!',
          }),
        },
      })

      workspaceWithParams = w
      projectWithParams = p
      commitWithParams = c
      documentWithParams = documents[0]!

      getSpansByIssueMock = vi
        .spyOn(getSpansByIssueModule, 'getSpansByIssue')
        .mockResolvedValue(Result.ok({ spans: [], next: null }))

      getSpansWithoutIssuesMock = vi
        .spyOn(getSpansWithoutIssuesModule, 'getSpansWithoutIssues')
        .mockResolvedValue(Result.ok({ spans: [], next: null }))

      issuesRepositoryMock = vi
        .spyOn(IssuesRepository.prototype, 'findActiveByDocument')
        .mockResolvedValue([])

      spanMetadatasGetMock = vi
        .spyOn(SpanMetadatasRepository.prototype, 'get')
        .mockImplementation(
          async ({ traceId, spanId }: { traceId: string; spanId: string }) => {
            const key = `${traceId}:${spanId}`
            const metadata = spanMetadataStore.get(key)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return Result.ok(metadata as any)
          },
        )
    })

    it('fails when no positive or negative examples found', async () => {
      const optimization = await factories.createOptimization({
        baseline: { commit },
        document,
        project,
        workspace,
      })

      await expect(
        prepareOptimization({
          optimization,
          workspace,
        }).then((r) => r.unwrap()),
      ).rejects.toThrowError(
        new UnprocessableEntityError(
          'At least 2 negative examples are required',
        ),
      )

      expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
      expect(publisherMock).not.toHaveBeenCalled()
    })

    it('fails when only one negative example found', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'positive1',
        }),
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'positive2',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      await expect(
        prepareOptimization({
          optimization,
          workspace: workspaceWithParams,
        }).then((r) => r.unwrap()),
      ).rejects.toThrowError(
        new UnprocessableEntityError(
          'At least 2 negative examples are required',
        ),
      )

      expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
      expect(publisherMock).not.toHaveBeenCalled()
    })

    it('fails when only one positive example found', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'negative2',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'positive1',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      await expect(
        prepareOptimization({
          optimization,
          workspace: workspaceWithParams,
        }).then((r) => r.unwrap()),
      ).rejects.toThrowError(
        new UnprocessableEntityError(
          'At least 2 positive examples are required',
        ),
      )

      expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
      expect(publisherMock).not.toHaveBeenCalled()
    })

    it('returns the same trainset and testset when already set', async () => {
      const optimization = await factories.createOptimization({
        baseline: { commit },
        document,
        project,
        workspace,
        trainset,
        testset,
      })

      const unpreparedOptimization = {
        ...optimization,
        preparedAt: null,
      } as Optimization

      const result = await prepareOptimization({
        optimization: unpreparedOptimization,
        workspace,
      }).then((r) => r.unwrap())

      expect(result.trainset.id).toBe(trainset.id)
      expect(result.testset.id).toBe(testset.id)

      expect(getSpansByIssueMock).not.toHaveBeenCalled()
      expect(getSpansWithoutIssuesMock).not.toHaveBeenCalled()
    })

    it('generates datasets from spans when no trainset/testset exists', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'negative2',
        }),
        createMockSpan('span-neg-3', 'trace-neg-3', {
          inputParam: 'negative3',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'positive1',
        }),
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'positive2',
        }),
        createMockSpan('span-pos-3', 'trace-pos-3', {
          inputParam: 'positive3',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      const result = await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(result.optimization.trainsetId).not.toBeNull()
      expect(result.optimization.testsetId).not.toBeNull()
      expect(result.trainset).toBeDefined()
      expect(result.testset).toBeDefined()

      expect(getSpansByIssueMock).toHaveBeenCalled()
      expect(getSpansWithoutIssuesMock).toHaveBeenCalled()
      expect(spanMetadatasGetMock).toHaveBeenCalled()

      expect(mocks.optimizationsQueue).toHaveBeenCalledTimes(1)
      expect(publisherMock).toHaveBeenCalledTimes(1)
    })

    it('generates datasets with correct naming', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'negative2',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'positive1',
        }),
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'positive2',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      const result = await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      const datasetsRepository = new DatasetsRepository(workspaceWithParams.id)

      const trainsetResult = await datasetsRepository.find(
        result.optimization.trainsetId!,
      )
      const testsetResult = await datasetsRepository.find(
        result.optimization.testsetId!,
      )

      const fetchedTrainset = trainsetResult.unwrap()
      const fetchedTestset = testsetResult.unwrap()

      expect(fetchedTrainset.name).toContain('Trainset')
      expect(fetchedTrainset.name).toContain(optimization.uuid.slice(0, 8))

      expect(fetchedTestset.name).toContain('Testset')
      expect(fetchedTestset.name).toContain(optimization.uuid.slice(0, 8))
    })

    it('extracts parameters from span metadata for dataset rows', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'neg_value_1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'neg_value_2',
        }),
        createMockSpan('span-neg-3', 'trace-neg-3', {
          inputParam: 'neg_value_3',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'pos_value_1',
        }),
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'pos_value_2',
        }),
        createMockSpan('span-pos-3', 'trace-pos-3', {
          inputParam: 'pos_value_3',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      const result = await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      const rowsRepository = new DatasetRowsRepository(workspaceWithParams.id)

      const trainRows = await rowsRepository.findByDatasetWithOffsetAndLimit({
        datasetId: result.optimization.trainsetId!,
        offset: 0,
        limit: 100,
      })

      const testRows = await rowsRepository.findByDatasetWithOffsetAndLimit({
        datasetId: result.optimization.testsetId!,
        offset: 0,
        limit: 100,
      })

      expect(trainRows.length + testRows.length).toBeGreaterThan(0)
    })

    it('applies PII masking to trainset but not testset', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'sensitive_neg_1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'sensitive_neg_2',
        }),
        createMockSpan('span-neg-3', 'trace-neg-3', {
          inputParam: 'sensitive_neg_3',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'sensitive_pos_1',
        }),
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'sensitive_pos_2',
        }),
        createMockSpan('span-pos-3', 'trace-pos-3', {
          inputParam: 'sensitive_pos_3',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
        configuration: {
          parameters: {
            inputParam: { isPii: true },
          },
          scope: {
            instructions: true,
          },
        },
      })

      const result = await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      const rowsRepository = new DatasetRowsRepository(workspaceWithParams.id)

      const trainRows = await rowsRepository.findByDatasetWithOffsetAndLimit({
        datasetId: result.optimization.trainsetId!,
        offset: 0,
        limit: 100,
      })

      const testRows = await rowsRepository.findByDatasetWithOffsetAndLimit({
        datasetId: result.optimization.testsetId!,
        offset: 0,
        limit: 100,
      })

      for (const row of trainRows) {
        const value = Object.values(row.rowData)[0] as string
        expect(value).toContain('(REDACTED)')
        expect(value).toContain('inputParam')
      }

      for (const row of testRows) {
        const value = Object.values(row.rowData)[0] as string
        expect(value).not.toContain('(REDACTED)')
        expect(value).toContain('sensitive')
      }
    })

    it('creates datasets with correct column structure from parameters', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'negative2',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'positive1',
        }),
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'positive2',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      const result = await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      const datasetsRepository = new DatasetsRepository(workspaceWithParams.id)

      const trainsetResult = await datasetsRepository.find(
        result.optimization.trainsetId!,
      )
      const testsetResult = await datasetsRepository.find(
        result.optimization.testsetId!,
      )

      const fetchedTrainset = trainsetResult.unwrap()
      const fetchedTestset = testsetResult.unwrap()

      expect(fetchedTrainset.columns.length).toBeGreaterThan(0)
      expect(fetchedTestset.columns.length).toBeGreaterThan(0)

      const trainColNames = fetchedTrainset.columns.map((c) => c.name)
      const testColNames = fetchedTestset.columns.map((c) => c.name)

      expect(trainColNames).toContain('inputParam')
      expect(testColNames).toContain('inputParam')
    })

    it('calls getSpansWithoutIssues with excludeFailedResults true for positive examples', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'negative2',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'positive1',
        }),
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'positive2',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(getSpansWithoutIssuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeFailedResults: true,
          includeExperiments: false,
        }),
      )
    })

    it('calls getSpansByIssue with includeExperiments false for negative examples', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'negative2',
        }),
      ]

      const positiveSpans = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'positive1',
        }),
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'positive2',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      getSpansWithoutIssuesMock.mockResolvedValue(
        Result.ok({ spans: positiveSpans, next: null }),
      )

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(getSpansByIssueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          includeExperiments: false,
        }),
      )
    })

    it('paginates through spans when more are needed', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpansPage1 = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
      ]

      const negativeSpansPage2 = [
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'negative2',
        }),
      ]

      const positiveSpansPage1 = [
        createMockSpan('span-pos-1', 'trace-pos-1', {
          inputParam: 'positive1',
        }),
      ]

      const positiveSpansPage2 = [
        createMockSpan('span-pos-2', 'trace-pos-2', {
          inputParam: 'positive2',
        }),
      ]

      let negativeCallCount = 0
      getSpansByIssueMock.mockImplementation(async () => {
        negativeCallCount++
        if (negativeCallCount === 1) {
          return Result.ok({
            spans: negativeSpansPage1,
            next: { value: new Date(), id: 1 },
          })
        }
        return Result.ok({ spans: negativeSpansPage2, next: null })
      })

      let positiveCallCount = 0
      getSpansWithoutIssuesMock.mockImplementation(async () => {
        positiveCallCount++
        if (positiveCallCount === 1) {
          return Result.ok({
            spans: positiveSpansPage1,
            next: { value: new Date(), id: 'cursor-1' },
          })
        }
        return Result.ok({ spans: positiveSpansPage2, next: null })
      })

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      const result = await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(result.optimization.preparedAt).not.toBeNull()
      expect(getSpansByIssueMock).toHaveBeenCalledTimes(2)
      expect(
        getSpansWithoutIssuesMock.mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
    })

    it('falls back to including failed results when not enough positive spans found', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const negativeSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
        createMockSpan('span-neg-2', 'trace-neg-2', {
          inputParam: 'negative2',
        }),
      ]

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({ spans: negativeSpans, next: null }),
      )

      const callArgs: { excludeFailedResults: boolean }[] = []
      let callCount = 0
      getSpansWithoutIssuesMock.mockImplementation(async (args) => {
        callArgs.push({ excludeFailedResults: args.excludeFailedResults })
        callCount++

        if (callCount === 1) {
          return Result.ok({
            spans: [
              createMockSpan('span-pos-1', 'trace-pos-1', {
                inputParam: 'positive1',
              }),
            ],
            next: null,
          })
        }

        if (callCount === 2) {
          return Result.ok({
            spans: [
              createMockSpan('span-pos-2', 'trace-pos-2', {
                inputParam: 'positive2',
              }),
            ],
            next: null,
          })
        }

        return Result.ok({ spans: [], next: null })
      })

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      const result = await prepareOptimization({
        optimization,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(result.optimization.preparedAt).not.toBeNull()

      expect(callArgs[0]!.excludeFailedResults).toBe(true)

      const fallbackCalls = callArgs.filter(
        (c) => c.excludeFailedResults === false,
      )
      expect(fallbackCalls.length).toBeGreaterThan(0)
    })

    it('stops searching after maxSearches limit is reached', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      getSpansByIssueMock.mockResolvedValue(
        Result.ok({
          spans: [
            createMockSpan('span-neg-1', 'trace-neg-1', {
              inputParam: 'negative1',
            }),
            createMockSpan('span-neg-2', 'trace-neg-2', {
              inputParam: 'negative2',
            }),
          ],
          next: null,
        }),
      )

      let searchCount = 0
      getSpansWithoutIssuesMock.mockImplementation(async () => {
        searchCount++
        return Result.ok({
          spans: [],
          next: { value: new Date(), id: `cursor-${searchCount}` },
        })
      })

      const optimization = await factories.createOptimization({
        baseline: { commit: commitWithParams },
        document: documentWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      })

      await expect(
        prepareOptimization({
          optimization,
          workspace: workspaceWithParams,
        }).then((r) => r.unwrap()),
      ).rejects.toThrowError()

      expect(searchCount).toBeLessThanOrEqual(3)
    })
  })
})
