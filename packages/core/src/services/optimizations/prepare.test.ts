import {
  OPTIMIZATION_MAX_ROWS,
  Providers,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import * as getSpansByEvaluationModule from '../../data-access/evaluations/getSpansByEvaluation'
import * as getSpansByIssueModule from '../../queries/issues/getSpansByIssue'
import * as getSpansWithoutIssuesModule from '../../queries/issues/getSpansWithoutIssues'
import * as getSpansByDocumentModule from '../../data-access/spans/getSpansByDocument'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import {
  DatasetRowsRepository,
  DatasetsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
} from '../../repositories'
import * as findActiveByDocumentModule from '../../queries/issues/findActiveByDocument'
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

const originalListAtCommitByDocument =
  EvaluationsV2Repository.prototype.listAtCommitByDocument

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
    let evaluationsV2RepositoryMock: MockInstance
    let getSpansByDocumentMock: MockInstance
    let getSpansByEvaluationMock: MockInstance
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

      evaluationsV2RepositoryMock = vi
        .spyOn(EvaluationsV2Repository.prototype, 'listAtCommitByDocument')
        .mockImplementation(async function (
          this: EvaluationsV2Repository,
          ...args: Parameters<EvaluationsV2Repository['listAtCommitByDocument']>
        ) {
          const result = await originalListAtCommitByDocument.apply(this, args)
          if (result.error) return result
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return Result.ok(result.value.map((e: any) => ({ ...e, issueId: 1 })))
        })

      getSpansByDocumentMock = vi
        .spyOn(getSpansByDocumentModule, 'getSpansByDocument')
        .mockResolvedValue(Result.ok({ spans: [], next: null }))

      getSpansByEvaluationMock = vi
        .spyOn(getSpansByEvaluationModule, 'getSpansByEvaluation')
        .mockResolvedValue(Result.ok({ spans: [], next: null }))

      getSpansByIssueMock = vi
        .spyOn(getSpansByIssueModule, 'getSpansByIssue')
        .mockResolvedValue(Result.ok({ spans: [], next: null }))

      getSpansWithoutIssuesMock = vi
        .spyOn(getSpansWithoutIssuesModule, 'getSpansWithoutIssues')
        .mockResolvedValue(Result.ok({ spans: [], next: null }))

      issuesRepositoryMock = vi
        .spyOn(findActiveByDocumentModule, 'findActiveIssuesByDocument')
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
      ).rejects.toThrowError(/At least 4 different examples are required/)

      expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
      expect(publisherMock).not.toHaveBeenCalled()
    })

    it('fails when not enough total examples found', async () => {
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
      ).rejects.toThrowError(/At least 4 different examples are required/)

      expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
      expect(publisherMock).not.toHaveBeenCalled()
    })

    it('fails when total examples below minimum even with some positives', async () => {
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
      ).rejects.toThrowError(/At least 4 different examples are required/)

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

    it('first tries to collect positive spans with passed annotations', async () => {
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
          requirePassedAnnotations: true,
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

    it('falls back through 4 tiers when not enough positive spans found', async () => {
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

      type CallArgs = {
        excludeFailedResults: boolean
        requirePassedResults: boolean
        requirePassedAnnotations: boolean
      }
      const callArgs: CallArgs[] = []
      let callCount = 0
      getSpansWithoutIssuesMock.mockImplementation(async (args: CallArgs) => {
        callArgs.push({
          excludeFailedResults: args.excludeFailedResults,
          requirePassedResults: args.requirePassedResults,
          requirePassedAnnotations: args.requirePassedAnnotations,
        })
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

      // Tier 1: passed annotations + exclude failed
      expect(callArgs[0]).toEqual(
        expect.objectContaining({
          excludeFailedResults: true,
          requirePassedAnnotations: true,
        }),
      )

      // Verify later tiers were attempted
      const tier2Calls = callArgs.filter(
        (c) =>
          c.excludeFailedResults === true &&
          c.requirePassedResults === true &&
          c.requirePassedAnnotations === false,
      )
      const tier3Calls = callArgs.filter(
        (c) =>
          c.excludeFailedResults === true &&
          c.requirePassedResults === false &&
          c.requirePassedAnnotations === false,
      )
      const tier4Calls = callArgs.filter(
        (c) =>
          c.excludeFailedResults === false &&
          c.requirePassedResults === false &&
          c.requirePassedAnnotations === false,
      )

      expect(
        tier2Calls.length + tier3Calls.length + tier4Calls.length,
      ).toBeGreaterThan(0)
    })

    it('falls back to evaluation results when evaluation has no linked issues', async () => {
      evaluationsV2RepositoryMock.mockRestore()

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

      getSpansByEvaluationMock.mockResolvedValue(
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

      expect(result.optimization.preparedAt).not.toBeNull()
      expect(getSpansByIssueMock).not.toHaveBeenCalled()
      expect(getSpansByEvaluationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluationUuid: optimization.evaluationUuid,
          passed: false,
        }),
      )
    })

    it('falls back to evaluation results after issues when not enough spans from issues', async () => {
      const mockIssue = createMockIssue(1)
      issuesRepositoryMock.mockResolvedValue([mockIssue])

      const issueSpans = [
        createMockSpan('span-neg-1', 'trace-neg-1', {
          inputParam: 'negative1',
        }),
      ]

      const evalSpans = [
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
        Result.ok({ spans: issueSpans, next: null }),
      )

      getSpansByEvaluationMock.mockResolvedValue(
        Result.ok({ spans: evalSpans, next: null }),
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

      expect(result.optimization.preparedAt).not.toBeNull()
      expect(getSpansByIssueMock).toHaveBeenCalled()
      expect(getSpansByEvaluationMock).toHaveBeenCalled()
    })

    describe('negative examples tier behavior', () => {
      it('tries tracked issues first when linked issues exist', async () => {
        const trackedIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([trackedIssue])

        const issueCallArgs: number[] = []
        getSpansByIssueMock.mockImplementation(
          async (args: { issue: { id: number } }) => {
            issueCallArgs.push(args.issue.id)
            return Result.ok({ spans: [], next: null })
          },
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({ spans: [], next: null }),
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
        }).catch(() => {})

        expect(issueCallArgs[0]).toBe(trackedIssue.id)
      })

      it('falls back to other issues when tracked issues return nothing', async () => {
        const trackedIssue = createMockIssue(1)
        const otherIssue = createMockIssue(2)
        issuesRepositoryMock.mockResolvedValue([trackedIssue, otherIssue])

        const issueCallArgs: number[] = []
        getSpansByIssueMock.mockImplementation(
          async (args: { issue: { id: number } }) => {
            issueCallArgs.push(args.issue.id)
            if (args.issue.id === 2) {
              return Result.ok({
                spans: [
                  createMockSpan('span-other', 'trace-other', {
                    inputParam: 'other1',
                  }),
                ],
                next: null,
              })
            }
            return Result.ok({ spans: [], next: null })
          },
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({ spans: [], next: null }),
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
        }).catch(() => {})

        expect(issueCallArgs).toContain(trackedIssue.id)
        expect(issueCallArgs).toContain(otherIssue.id)
      })

      it('cascades through all 4 tiers when linked issues exist but are insufficient', async () => {
        const trackedIssue = createMockIssue(1)
        const otherIssue = createMockIssue(2)
        issuesRepositoryMock.mockResolvedValue([trackedIssue, otherIssue])

        const extraEval = await factories.createEvaluationV2({
          workspace: workspaceWithParams,
          document: documentWithParams,
          commit: commitWithParams,
        })

        getSpansByIssueMock.mockResolvedValue(
          Result.ok({ spans: [], next: null }),
        )

        const evalCallArgs: string[] = []
        getSpansByEvaluationMock.mockImplementation(
          async (args: { evaluationUuid: string }) => {
            evalCallArgs.push(args.evaluationUuid)
            return Result.ok({
              spans: [
                createMockSpan(
                  `span-eval-${evalCallArgs.length}`,
                  `trace-eval-${evalCallArgs.length}`,
                  { inputParam: `eval${evalCallArgs.length}` },
                ),
              ],
              next: null,
            })
          },
        )

        const positiveSpans = [
          createMockSpan('span-pos-1', 'trace-pos-1', {
            inputParam: 'positive1',
          }),
          createMockSpan('span-pos-2', 'trace-pos-2', {
            inputParam: 'positive2',
          }),
        ]

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
        }).catch(() => {})

        // Tier 1+2: Issues were tried (returned empty)
        expect(getSpansByIssueMock).toHaveBeenCalled()

        // Tier 3: Selected evaluation was tried
        expect(evalCallArgs).toContain(optimization.evaluationUuid)

        // Tier 4: Other evaluation was tried
        expect(evalCallArgs).toContain(extraEval.uuid)
      })

      it('uses only evaluation tiers when no linked issues exist', async () => {
        evaluationsV2RepositoryMock.mockRestore()

        const extraEval = await factories.createEvaluationV2({
          workspace: workspaceWithParams,
          document: documentWithParams,
          commit: commitWithParams,
        })

        const evalCallArgs: string[] = []
        getSpansByEvaluationMock.mockImplementation(
          async (args: { evaluationUuid: string }) => {
            evalCallArgs.push(args.evaluationUuid)
            return Result.ok({
              spans: [
                createMockSpan(
                  `span-eval-${evalCallArgs.length}`,
                  `trace-eval-${evalCallArgs.length}`,
                  { inputParam: `eval${evalCallArgs.length}` },
                ),
              ],
              next: null,
            })
          },
        )

        const positiveSpans = [
          createMockSpan('span-pos-1', 'trace-pos-1', {
            inputParam: 'positive1',
          }),
          createMockSpan('span-pos-2', 'trace-pos-2', {
            inputParam: 'positive2',
          }),
        ]

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
        }).catch(() => {})

        // Issue-based collection was skipped entirely
        expect(getSpansByIssueMock).not.toHaveBeenCalled()

        // Selected evaluation was tried first
        expect(evalCallArgs[0]).toBe(optimization.evaluationUuid)

        // Other evaluations were also tried
        expect(evalCallArgs).toContain(extraEval.uuid)
      })

      it('excludes selected evaluation from other evaluations tier', async () => {
        evaluationsV2RepositoryMock.mockRestore()

        const extraEval1 = await factories.createEvaluationV2({
          workspace: workspaceWithParams,
          document: documentWithParams,
          commit: commitWithParams,
        })

        const extraEval2 = await factories.createEvaluationV2({
          workspace: workspaceWithParams,
          document: documentWithParams,
          commit: commitWithParams,
        })

        const evalCallArgs: string[] = []
        getSpansByEvaluationMock.mockImplementation(
          async (args: { evaluationUuid: string }) => {
            evalCallArgs.push(args.evaluationUuid)
            return Result.ok({ spans: [], next: null })
          },
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({ spans: [], next: null }),
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
        }).catch(() => {})

        // The selected evaluation should appear exactly once (Tier 3)
        const selectedEvalCalls = evalCallArgs.filter(
          (uuid) => uuid === optimization.evaluationUuid,
        )
        expect(selectedEvalCalls).toHaveLength(1)

        // Other evaluations should appear but NOT the selected one in Tier 4
        const otherEvalCalls = evalCallArgs.slice(1)
        expect(otherEvalCalls).not.toContain(optimization.evaluationUuid)
        expect(
          otherEvalCalls.includes(extraEval1.uuid) ||
            otherEvalCalls.includes(extraEval2.uuid),
        ).toBe(true)
      })

      it('tries selected evaluation before other evaluations', async () => {
        evaluationsV2RepositoryMock.mockRestore()

        await factories.createEvaluationV2({
          workspace: workspaceWithParams,
          document: documentWithParams,
          commit: commitWithParams,
        })

        const evalCallArgs: string[] = []
        getSpansByEvaluationMock.mockImplementation(
          async (args: { evaluationUuid: string }) => {
            evalCallArgs.push(args.evaluationUuid)
            return Result.ok({ spans: [], next: null })
          },
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({ spans: [], next: null }),
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
        }).catch(() => {})

        // First call must be the selected evaluation (Tier 3 before Tier 4)
        expect(evalCallArgs.length).toBeGreaterThanOrEqual(2)
        expect(evalCallArgs[0]).toBe(optimization.evaluationUuid)
        expect(evalCallArgs[1]).not.toBe(optimization.evaluationUuid)
      })
    })

    describe('getExamples fallback tier', () => {
      it('fills negative and positive slots from document spans when both are insufficient', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        getSpansByIssueMock.mockResolvedValue(
          Result.ok({
            spans: [
              createMockSpan('span-neg-1', 'trace-neg-1', {
                inputParam: 'negative1',
              }),
            ],
            next: null,
          }),
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({
            spans: [
              createMockSpan('span-pos-1', 'trace-pos-1', {
                inputParam: 'positive1',
              }),
            ],
            next: null,
          }),
        )

        const fallbackSpans = [
          createMockSpan('span-fb-1', 'trace-fb-1', {
            inputParam: 'fallback1',
          }),
          createMockSpan('span-fb-2', 'trace-fb-2', {
            inputParam: 'fallback2',
          }),
        ]

        getSpansByDocumentMock.mockResolvedValue(
          Result.ok({ spans: fallbackSpans, next: null }),
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

        expect(result.optimization.preparedAt).not.toBeNull()
        expect(getSpansByDocumentMock).toHaveBeenCalled()
      })

      it('is not called when negatives and positives are already sufficient', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        const halfLimit = Math.floor(OPTIMIZATION_MAX_ROWS / 2)

        const negativeSpans = Array.from({ length: halfLimit }, (_, i) =>
          createMockSpan(`span-neg-${i}`, `trace-neg-${i}`, {
            inputParam: `neg_${i}`,
          }),
        )

        const positiveSpans = Array.from({ length: halfLimit }, (_, i) =>
          createMockSpan(`span-pos-${i}`, `trace-pos-${i}`, {
            inputParam: `pos_${i}`,
          }),
        )

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

        expect(getSpansByDocumentMock).not.toHaveBeenCalled()
      })

      it('only fills positive slots when negatives are sufficient', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        const negativeSpans = Array.from({ length: 125 }, (_, i) =>
          createMockSpan(`span-neg-${i}`, `trace-neg-${i}`, {
            inputParam: `neg_${i}`,
          }),
        )

        getSpansByIssueMock.mockResolvedValue(
          Result.ok({ spans: negativeSpans, next: null }),
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({
            spans: [
              createMockSpan('span-pos-1', 'trace-pos-1', {
                inputParam: 'positive1',
              }),
            ],
            next: null,
          }),
        )

        const fallbackSpans = [
          createMockSpan('span-fb-1', 'trace-fb-1', {
            inputParam: 'fallback1',
          }),
        ]

        getSpansByDocumentMock.mockResolvedValue(
          Result.ok({ spans: fallbackSpans, next: null }),
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
        }).catch(() => {})

        expect(getSpansByDocumentMock).toHaveBeenCalled()
      })

      it('only fills negative slots when positives are sufficient', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        getSpansByIssueMock.mockResolvedValue(
          Result.ok({
            spans: [
              createMockSpan('span-neg-1', 'trace-neg-1', {
                inputParam: 'negative1',
              }),
            ],
            next: null,
          }),
        )

        const positiveSpans = Array.from({ length: 125 }, (_, i) =>
          createMockSpan(`span-pos-${i}`, `trace-pos-${i}`, {
            inputParam: `pos_${i}`,
          }),
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({ spans: positiveSpans, next: null }),
        )

        const fallbackSpans = [
          createMockSpan('span-fb-1', 'trace-fb-1', {
            inputParam: 'fallback1',
          }),
        ]

        getSpansByDocumentMock.mockResolvedValue(
          Result.ok({ spans: fallbackSpans, next: null }),
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
        }).catch(() => {})

        expect(getSpansByDocumentMock).toHaveBeenCalled()
      })

      it('does not duplicate spans already seen by negative or positive collectors', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        const sharedSpan = createMockSpan('span-shared', 'trace-shared', {
          inputParam: 'shared_value',
        })

        getSpansByIssueMock.mockResolvedValue(
          Result.ok({
            spans: [sharedSpan],
            next: null,
          }),
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({
            spans: [
              createMockSpan('span-pos-1', 'trace-pos-1', {
                inputParam: 'positive1',
              }),
            ],
            next: null,
          }),
        )

        getSpansByDocumentMock.mockResolvedValue(
          Result.ok({
            spans: [
              sharedSpan,
              createMockSpan('span-fb-new', 'trace-fb-new', {
                inputParam: 'fallback_new',
              }),
            ],
            next: null,
          }),
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
        }).catch(() => {})

        expect(getSpansByDocumentMock).toHaveBeenCalled()
      })

      it('rejects spans with duplicate parameter values across collectors', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        getSpansByIssueMock.mockResolvedValue(
          Result.ok({
            spans: [
              createMockSpan('span-neg-1', 'trace-neg-1', {
                inputParam: 'same_value',
              }),
              createMockSpan('span-neg-2', 'trace-neg-2', {
                inputParam: 'same_value',
              }),
            ],
            next: null,
          }),
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({
            spans: [
              createMockSpan('span-pos-dup', 'trace-pos-dup', {
                inputParam: 'same_value',
              }),
              createMockSpan('span-pos-1', 'trace-pos-1', {
                inputParam: 'positive1',
              }),
            ],
            next: null,
          }),
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
        ).rejects.toThrowError(/At least 4 different examples are required/)
      })

      it('distributes fallback spans to whichever bucket has the larger deficit', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        getSpansByIssueMock.mockResolvedValue(
          Result.ok({ spans: [], next: null }),
        )

        getSpansWithoutIssuesMock.mockResolvedValue(
          Result.ok({
            spans: [
              createMockSpan('span-pos-1', 'trace-pos-1', {
                inputParam: 'positive1',
              }),
              createMockSpan('span-pos-2', 'trace-pos-2', {
                inputParam: 'positive2',
              }),
            ],
            next: null,
          }),
        )

        const fallbackSpans = Array.from({ length: 4 }, (_, i) =>
          createMockSpan(`span-fb-${i}`, `trace-fb-${i}`, {
            inputParam: `fallback_${i}`,
          }),
        )

        getSpansByDocumentMock.mockResolvedValue(
          Result.ok({ spans: fallbackSpans, next: null }),
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
        }).catch(() => {})

        expect(getSpansByDocumentMock).toHaveBeenCalled()
      })
    })

    describe('dataset.target configuration', () => {
      it('limits curated examples to target when set', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        const target = 10

        const negativeSpans = Array.from({ length: 50 }, (_, i) =>
          createMockSpan(`span-neg-${i}`, `trace-neg-${i}`, {
            inputParam: `neg_${i}`,
          }),
        )

        const positiveSpans = Array.from({ length: 50 }, (_, i) =>
          createMockSpan(`span-pos-${i}`, `trace-pos-${i}`, {
            inputParam: `pos_${i}`,
          }),
        )

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
            dataset: { target },
            scope: { instructions: true },
          },
        })

        const result = await prepareOptimization({
          optimization,
          workspace: workspaceWithParams,
        }).then((r) => r.unwrap())

        const rowsRepository = new DatasetRowsRepository(workspaceWithParams.id)
        const trainCount = await rowsRepository.getCountByDataset(
          result.optimization.trainsetId!,
        )
        const testCount = await rowsRepository.getCountByDataset(
          result.optimization.testsetId!,
        )

        expect(trainCount! + testCount!).toBeLessThanOrEqual(target)
      })

      it('defaults to OPTIMIZATION_MAX_ROWS when target is not set', async () => {
        const mockIssue = createMockIssue(1)
        issuesRepositoryMock.mockResolvedValue([mockIssue])

        const halfMax = Math.floor(OPTIMIZATION_MAX_ROWS / 2)

        const negativeSpans = Array.from({ length: halfMax + 50 }, (_, i) =>
          createMockSpan(`span-neg-${i}`, `trace-neg-${i}`, {
            inputParam: `neg_${i}`,
          }),
        )

        const positiveSpans = Array.from({ length: halfMax + 50 }, (_, i) =>
          createMockSpan(`span-pos-${i}`, `trace-pos-${i}`, {
            inputParam: `pos_${i}`,
          }),
        )

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
        const trainCount = await rowsRepository.getCountByDataset(
          result.optimization.trainsetId!,
        )
        const testCount = await rowsRepository.getCountByDataset(
          result.optimization.testsetId!,
        )

        expect(trainCount! + testCount!).toBeLessThanOrEqual(
          OPTIMIZATION_MAX_ROWS,
        )
      })

      it('curates more examples with a larger target', async () => {
        const mockIssue = createMockIssue(1)

        async function runWithTarget(target: number, suffix: string) {
          spanMetadataStore.clear()

          const negSpans = Array.from({ length: 300 }, (_, i) =>
            createMockSpan(
              `span-neg-${suffix}-${i}`,
              `trace-neg-${suffix}-${i}`,
              {
                inputParam: `neg_${suffix}_${i}`,
              },
            ),
          )

          const posSpans = Array.from({ length: 300 }, (_, i) =>
            createMockSpan(
              `span-pos-${suffix}-${i}`,
              `trace-pos-${suffix}-${i}`,
              {
                inputParam: `pos_${suffix}_${i}`,
              },
            ),
          )

          issuesRepositoryMock.mockResolvedValue([mockIssue])
          getSpansByIssueMock.mockResolvedValue(
            Result.ok({ spans: negSpans, next: null }),
          )
          getSpansWithoutIssuesMock.mockResolvedValue(
            Result.ok({ spans: posSpans, next: null }),
          )

          const optimization = await factories.createOptimization({
            baseline: { commit: commitWithParams },
            document: documentWithParams,
            project: projectWithParams,
            workspace: workspaceWithParams,
            configuration: {
              dataset: { target },
              scope: { instructions: true },
            },
          })

          const result = await prepareOptimization({
            optimization,
            workspace: workspaceWithParams,
          }).then((r) => r.unwrap())

          const rowsRepository = new DatasetRowsRepository(
            workspaceWithParams.id,
          )
          const trainCount = await rowsRepository.getCountByDataset(
            result.optimization.trainsetId!,
          )
          const testCount = await rowsRepository.getCountByDataset(
            result.optimization.testsetId!,
          )

          return trainCount! + testCount!
        }

        const smallTotal = await runWithTarget(10, 'small')
        const largeTotal = await runWithTarget(100, 'large')

        expect(largeTotal).toBeGreaterThan(smallTotal)
      })
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

      expect(searchCount).toBeLessThanOrEqual(4 * 3)
    })
  })
})
