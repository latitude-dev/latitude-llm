import {
  OPTIMIZATION_MAX_ROWS,
  OPTIMIZATION_MIN_ROWS,
  OPTIMIZATION_TESTSET_SPLIT,
  Providers,
} from '@latitude-data/constants'
import * as envModule from '@latitude-data/env'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  RuleEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { DatasetRowsRepository, DatasetsRepository } from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import * as featureModule from '../workspaceFeatures/isFeatureEnabledByName'
import { startOptimization } from './start'

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

describe('startOptimization', () => {
  let publisherMock: MockInstance
  let featureMock: MockInstance

  let workspace: WorkspaceDto
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.RegularExpression
  >

  beforeEach(async () => {
    vi.clearAllMocks()

    vi.spyOn(envModule, 'env', 'get').mockReturnValue({
      ...envModule.env,
      LATITUDE_CLOUD: true,
    })

    featureMock = vi
      .spyOn(featureModule, 'isFeatureEnabledByName')
      .mockResolvedValue(Result.ok(true))

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
        }),
      },
    })

    workspace = w
    project = p
    commit = c
    document = documents[0]!

    evaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.RegularExpression,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        pattern: '.*',
      },
    })

    publisherMock = vi.mocked(publisher.publishLater)
  })

  it('fails when LATITUDE_CLOUD is not enabled', async () => {
    vi.spyOn(envModule, 'env', 'get').mockReturnValue({
      ...envModule.env,
      LATITUDE_CLOUD: false,
    })

    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(BadRequestError)

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when optimizations feature is not enabled', async () => {
    featureMock.mockResolvedValue(Result.ok(false))

    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Optimizations feature flag is not enabled'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when document content has errors', async () => {
    const invalidDocument = { ...document, content: '---\ninvalid: yaml: :' }

    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document: invalidDocument,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Cannot optimize an invalid prompt'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when evaluation does not support batch evaluation', async () => {
    const humanEvaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      name: 'human evaluation',
      type: EvaluationType.Human,
      metric: HumanEvaluationMetric.Rating,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        criteria: 'criteria',
        minRating: 1,
        minRatingDescription: 'min description',
        maxRating: 5,
        maxRatingDescription: 'max description',
        minThreshold: 3,
      },
    })

    await expect(
      startOptimization({
        evaluation: humanEvaluation,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        'Cannot optimize for an evaluation that does not support batch evaluation',
      ),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when dataset column is not found for a prompt parameter', async () => {
    const {
      workspace: w2,
      project: p2,
      documents: docsWithParams,
      commit: commitWithParams,
      user: u2,
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

    const docWithParams = docsWithParams[0]!
    const evalForDoc = await factories.createEvaluationV2({
      document: docWithParams,
      commit: commitWithParams,
      workspace: w2,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.RegularExpression,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        pattern: '.*',
      },
    })

    const { dataset: datasetWithWrongCols } = await factories.createDataset({
      workspace: w2,
      author: u2,
      fileContent: `
wrongColumn
value1
`.trim(),
    })

    featureMock.mockResolvedValue(Result.ok(true))

    await expect(
      startOptimization({
        evaluation: evalForDoc,
        dataset: datasetWithWrongCols,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document: docWithParams,
        baselineCommit: commitWithParams,
        project: p2,
        workspace: w2,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError("Column 'inputParam' not found in dataset"),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when no optimization scope is provided', async () => {
    await expect(
      startOptimization({
        evaluation,
        configuration: {},
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('At least one optimization scope is required'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when scope has neither configuration nor instructions enabled', async () => {
    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: {
            configuration: false,
            instructions: false,
          },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('At least one optimization scope is required'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when budget time is negative', async () => {
    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: { instructions: true },
          budget: { time: -1 },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Time budget must be a number between 0 and 2 hours'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when budget time exceeds maximum (2 hours)', async () => {
    const maxTime = 2 * 60 * 60 // 2 hours in seconds
    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: { instructions: true },
          budget: { time: maxTime + 1 },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Time budget must be a number between 0 and 2 hours'),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when budget tokens is negative', async () => {
    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: { instructions: true },
          budget: { tokens: -1 },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        'Token budget must be a number between 0 and 100 million tokens',
      ),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when budget tokens exceeds maximum (100M)', async () => {
    const maxTokens = 100_000_000
    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: { instructions: true },
          budget: { tokens: maxTokens + 1 },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        'Token budget must be a number between 0 and 100 million tokens',
      ),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when dataset.target is below minimum', async () => {
    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: { instructions: true },
          dataset: { target: OPTIMIZATION_MIN_ROWS - 1 },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        `Dataset curation target must be a number between ${OPTIMIZATION_MIN_ROWS} and ${OPTIMIZATION_MAX_ROWS} rows`,
      ),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('fails when dataset.target exceeds maximum', async () => {
    await expect(
      startOptimization({
        evaluation,
        configuration: {
          scope: { instructions: true },
          dataset: { target: OPTIMIZATION_MAX_ROWS + 1 },
        },
        document,
        baselineCommit: commit,
        project,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(
        `Dataset curation target must be a number between ${OPTIMIZATION_MIN_ROWS} and ${OPTIMIZATION_MAX_ROWS} rows`,
      ),
    )

    expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('succeeds with valid dataset.target', async () => {
    const result = await startOptimization({
      evaluation,
      configuration: {
        scope: { instructions: true },
        dataset: { target: 50 },
      },
      document,
      baselineCommit: commit,
      project,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization).toBeDefined()
    expect(result.optimization.configuration.dataset?.target).toBe(50)

    expect(mocks.optimizationsQueue).toHaveBeenCalledTimes(1)
    expect(publisherMock).toHaveBeenCalledTimes(1)
  })

  it('clears dataset.target when a dataset is provided', async () => {
    const {
      workspace: w2,
      project: p2,
      documents: docsWithParams,
      commit: commitWithParams,
      user: u2,
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

    const docWithParams = docsWithParams[0]!
    const evalForDoc = await factories.createEvaluationV2({
      document: docWithParams,
      commit: commitWithParams,
      workspace: w2,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.RegularExpression,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        pattern: '.*',
      },
    })

    const { dataset } = await factories.createDataset({
      workspace: w2,
      author: u2,
      fileContent: `
inputParam
value1
value2
value3
value4
`.trim(),
    })

    const result = await startOptimization({
      evaluation: evalForDoc,
      dataset,
      configuration: {
        scope: { instructions: true },
        dataset: { target: 50 },
      },
      document: docWithParams,
      baselineCommit: commitWithParams,
      project: p2,
      workspace: w2,
    }).then((r) => r.unwrap())

    expect(result.optimization.configuration.dataset?.target).toBeUndefined()
  })

  it('succeeds with valid budget configuration', async () => {
    const result = await startOptimization({
      evaluation,
      configuration: {
        scope: { instructions: true },
        budget: { time: 300, tokens: 50_000_000 },
      },
      document,
      baselineCommit: commit,
      project,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization).toBeDefined()
    expect(result.optimization.configuration.budget).toEqual({
      time: 300,
      tokens: 50_000_000,
    })

    expect(mocks.optimizationsQueue).toHaveBeenCalledTimes(1)
    expect(publisherMock).toHaveBeenCalledTimes(1)
  })

  it('succeeds with scope.configuration enabled', async () => {
    const result = await startOptimization({
      evaluation,
      configuration: {
        scope: { configuration: true },
      },
      document,
      baselineCommit: commit,
      project,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization).toBeDefined()
    expect(result.optimization.configuration.scope).toEqual({
      configuration: true,
    })

    expect(mocks.optimizationsQueue).toHaveBeenCalledTimes(1)
    expect(publisherMock).toHaveBeenCalledTimes(1)
  })

  it('succeeds with both scope options enabled', async () => {
    const result = await startOptimization({
      evaluation,
      configuration: {
        scope: { configuration: true, instructions: true },
      },
      document,
      baselineCommit: commit,
      project,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization).toBeDefined()
    expect(result.optimization.configuration.scope).toEqual({
      configuration: true,
      instructions: true,
    })

    expect(mocks.optimizationsQueue).toHaveBeenCalledTimes(1)
    expect(publisherMock).toHaveBeenCalledTimes(1)
  })

  it('succeeds when starting optimization without dataset', async () => {
    const result = await startOptimization({
      evaluation,
      configuration: {
        scope: {
          instructions: true,
        },
      },
      document,
      baselineCommit: commit,
      project,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization).toBeDefined()
    expect(result.optimization.workspaceId).toBe(workspace.id)
    expect(result.optimization.projectId).toBe(project.id)
    expect(result.optimization.documentUuid).toBe(document.documentUuid)
    expect(result.optimization.baselineCommitId).toBe(commit.id)
    expect(result.optimization.evaluationUuid).toBe(evaluation.uuid)
    expect(result.optimization.trainsetId).toBeNull()
    expect(result.optimization.testsetId).toBeNull()

    expect(mocks.optimizationsQueue).toHaveBeenCalledTimes(1)
    expect(mocks.optimizationsQueue).toHaveBeenCalledWith(
      'prepareOptimizationJob',
      {
        workspaceId: workspace.id,
        optimizationId: result.optimization.id,
      },
      expect.objectContaining({
        jobId: expect.stringContaining('prepareOptimizationJob'),
        attempts: 1,
        deduplication: expect.any(Object),
      }),
    )

    expect(publisherMock).toHaveBeenCalledTimes(1)
    expect(publisherMock).toHaveBeenCalledWith({
      type: 'optimizationStarted',
      data: {
        workspaceId: workspace.id,
        optimizationId: result.optimization.id,
      },
    })
  })

  it('stores the baseline prompt correctly', async () => {
    const result = await startOptimization({
      evaluation,
      configuration: {
        scope: {
          instructions: true,
        },
      },
      document,
      baselineCommit: commit,
      project,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.baselinePrompt).toBe(document.content)
  })

  it('stores the configuration correctly', async () => {
    const configuration = {
      parameters: {
        testParam: { column: 'param1', isPii: true },
      },
      scope: {
        instructions: true,
      },
    }

    const result = await startOptimization({
      evaluation,
      configuration,
      document,
      baselineCommit: commit,
      project,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.configuration).toEqual(configuration)
  })

  describe('dataset splitting', () => {
    let userForSplit: User
    let documentWithParams: DocumentVersion
    let commitWithParams: Commit
    let projectWithParams: Project
    let workspaceWithParams: WorkspaceDto
    let evaluationForDoc: EvaluationV2<
      EvaluationType.Rule,
      RuleEvaluationMetric.RegularExpression
    >

    beforeEach(async () => {
      vi.clearAllMocks()

      vi.spyOn(envModule, 'env', 'get').mockReturnValue({
        ...envModule.env,
        LATITUDE_CLOUD: true,
      })

      vi.spyOn(featureModule, 'isFeatureEnabledByName').mockResolvedValue(
        Result.ok(true),
      )

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
            content: 'Hello {{inputParam}}!',
          }),
        },
      })

      workspaceWithParams = w
      projectWithParams = p
      commitWithParams = c
      documentWithParams = documents[0]!
      userForSplit = u

      evaluationForDoc = await factories.createEvaluationV2({
        document: documentWithParams,
        commit: commitWithParams,
        workspace: workspaceWithParams,
        type: EvaluationType.Rule,
        metric: RuleEvaluationMetric.RegularExpression,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          expectedOutput: {
            parsingFormat: 'string',
          },
          pattern: '.*',
        },
      })

      publisherMock = vi.mocked(publisher.publishLater)
    })

    it('fails when dataset has only 1 row', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `
inputParam
value1
`.trim(),
      })

      await expect(
        startOptimization({
          evaluation: evaluationForDoc,
          dataset,
          configuration: {
            scope: {
              instructions: true,
            },
          },
          document: documentWithParams,
          baselineCommit: commitWithParams,
          project: projectWithParams,
          workspace: workspaceWithParams,
        }).then((r) => r.unwrap()),
      ).rejects.toThrowError(/At least 4 dataset rows are required/)

      expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
      expect(publisherMock).not.toHaveBeenCalled()
    })

    it('fails when dataset has 2 rows', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `
inputParam
value1
value2
`.trim(),
      })

      await expect(
        startOptimization({
          evaluation: evaluationForDoc,
          dataset,
          configuration: {
            scope: {
              instructions: true,
            },
          },
          document: documentWithParams,
          baselineCommit: commitWithParams,
          project: projectWithParams,
          workspace: workspaceWithParams,
        }).then((r) => r.unwrap()),
      ).rejects.toThrowError(/At least 4 dataset rows are required/)

      expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
      expect(publisherMock).not.toHaveBeenCalled()
    })

    it('fails when dataset has 3 rows', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `
inputParam
value1
value2
value3
`.trim(),
      })

      await expect(
        startOptimization({
          evaluation: evaluationForDoc,
          dataset,
          configuration: {
            scope: {
              instructions: true,
            },
          },
          document: documentWithParams,
          baselineCommit: commitWithParams,
          project: projectWithParams,
          workspace: workspaceWithParams,
        }).then((r) => r.unwrap()),
      ).rejects.toThrowError(/At least 4 dataset rows are required/)

      expect(mocks.optimizationsQueue).not.toHaveBeenCalled()
      expect(publisherMock).not.toHaveBeenCalled()
    })

    it('succeeds when dataset has 4 rows (minimum valid split)', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `
inputParam
value1
value2
value3
value4
`.trim(),
      })

      const result = await startOptimization({
        evaluation: evaluationForDoc,
        dataset,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document: documentWithParams,
        baselineCommit: commitWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(result.optimization.trainsetId).not.toBeNull()
      expect(result.optimization.testsetId).not.toBeNull()

      const rowsRepository = new DatasetRowsRepository(workspaceWithParams.id)
      const trainCount = await rowsRepository.getCountByDataset(
        result.optimization.trainsetId!,
      )
      const testCount = await rowsRepository.getCountByDataset(
        result.optimization.testsetId!,
      )

      expect(trainCount! + testCount!).toBe(4)
      expect(trainCount).toBeGreaterThanOrEqual(1)
      expect(testCount).toBeGreaterThanOrEqual(1)
    })

    it('creates trainset and testset with correct 70/30 split', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `
inputParam
value1
value2
value3
value4
value5
value6
value7
value8
value9
value10
`.trim(),
      })

      const result = await startOptimization({
        evaluation: evaluationForDoc,
        dataset,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document: documentWithParams,
        baselineCommit: commitWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(result.optimization.trainsetId).not.toBeNull()
      expect(result.optimization.testsetId).not.toBeNull()

      const rowsRepository = new DatasetRowsRepository(workspaceWithParams.id)
      const trainCount = await rowsRepository.getCountByDataset(
        result.optimization.trainsetId!,
      )
      const testCount = await rowsRepository.getCountByDataset(
        result.optimization.testsetId!,
      )

      expect(trainCount! + testCount!).toBe(10)
      expect(trainCount).toBe(Math.floor(10 * OPTIMIZATION_TESTSET_SPLIT))
      expect(testCount).toBe(10 - Math.floor(10 * OPTIMIZATION_TESTSET_SPLIT))
    })

    it('names trainset and testset datasets correctly', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        name: 'My Dataset',
        fileContent: `
inputParam
value1
value2
value3
value4
`.trim(),
      })

      const result = await startOptimization({
        evaluation: evaluationForDoc,
        dataset,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document: documentWithParams,
        baselineCommit: commitWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      const datasetsRepository = new DatasetsRepository(workspaceWithParams.id)

      const trainset = await datasetsRepository
        .find(result.optimization.trainsetId!)
        .then((r) => r.unwrap())
      const testset = await datasetsRepository
        .find(result.optimization.testsetId!)
        .then((r) => r.unwrap())

      expect(trainset.name).toContain('My Dataset')
      expect(trainset.name).toContain('Trainset')
      expect(trainset.name).toContain(result.optimization.uuid.slice(0, 8))

      expect(testset.name).toContain('My Dataset')
      expect(testset.name).toContain('Testset')
      expect(testset.name).toContain(result.optimization.uuid.slice(0, 8))
    })

    it('masks PII parameters in trainset but not in testset', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `
inputParam
sensitive_data_1
sensitive_data_2
sensitive_data_3
sensitive_data_4
`.trim(),
      })

      const result = await startOptimization({
        evaluation: evaluationForDoc,
        dataset,
        configuration: {
          parameters: {
            inputParam: { isPii: true },
          },
          scope: {
            instructions: true,
          },
        },
        document: documentWithParams,
        baselineCommit: commitWithParams,
        project: projectWithParams,
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
        expect(value).toContain('sensitive_data')
      }
    })

    it('preserves all data in trainset and testset combined', async () => {
      const originalValues = ['value1', 'value2', 'value3', 'value4', 'value5']
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `inputParam\n${originalValues.join('\n')}`,
      })

      const result = await startOptimization({
        evaluation: evaluationForDoc,
        dataset,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document: documentWithParams,
        baselineCommit: commitWithParams,
        project: projectWithParams,
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

      const allValues = [
        ...trainRows.map((r) => Object.values(r.rowData)[0] as string),
        ...testRows.map((r) => Object.values(r.rowData)[0] as string),
      ]

      expect(allValues.sort()).toEqual(originalValues.sort())
    })

    it('copies column structure from original dataset', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `
inputParam,extraCol1,extraCol2
value1,extra1,extra2
value2,extra3,extra4
value3,extra5,extra6
value4,extra7,extra8
`.trim(),
      })

      const result = await startOptimization({
        evaluation: evaluationForDoc,
        dataset,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document: documentWithParams,
        baselineCommit: commitWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      const datasetsRepository = new DatasetsRepository(workspaceWithParams.id)

      const trainset = await datasetsRepository
        .find(result.optimization.trainsetId!)
        .then((r) => r.unwrap())
      const testset = await datasetsRepository
        .find(result.optimization.testsetId!)
        .then((r) => r.unwrap())

      expect(trainset.columns.length).toBe(dataset.columns.length)
      expect(testset.columns.length).toBe(dataset.columns.length)

      const originalColNames = dataset.columns.map((c) => c.name).sort()
      const trainColNames = trainset.columns.map((c) => c.name).sort()
      const testColNames = testset.columns.map((c) => c.name).sort()

      expect(trainColNames).toEqual(originalColNames)
      expect(testColNames).toEqual(originalColNames)
    })

    it('uses column mapping from configuration for parameter matching', async () => {
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `
mappedColumn
value1
value2
value3
value4
`.trim(),
      })

      const result = await startOptimization({
        evaluation: evaluationForDoc,
        dataset,
        configuration: {
          parameters: {
            inputParam: { column: 'mappedColumn' },
          },
          scope: {
            instructions: true,
          },
        },
        document: documentWithParams,
        baselineCommit: commitWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(result.optimization.trainsetId).not.toBeNull()
      expect(result.optimization.testsetId).not.toBeNull()

      const rowsRepository = new DatasetRowsRepository(workspaceWithParams.id)
      const trainCount = await rowsRepository.getCountByDataset(
        result.optimization.trainsetId!,
      )
      const testCount = await rowsRepository.getCountByDataset(
        result.optimization.testsetId!,
      )

      expect(trainCount! + testCount!).toBe(4)
    })

    it('caps dataset rows at OPTIMIZATION_MAX_ROWS without throwing error', async () => {
      const rowCount = OPTIMIZATION_MAX_ROWS + 50
      const rows = Array.from({ length: rowCount }, (_, i) => `value${i + 1}`)
      const { dataset } = await factories.createDataset({
        workspace: workspaceWithParams,
        author: userForSplit,
        fileContent: `inputParam\n${rows.join('\n')}`,
      })

      const result = await startOptimization({
        evaluation: evaluationForDoc,
        dataset,
        configuration: {
          scope: {
            instructions: true,
          },
        },
        document: documentWithParams,
        baselineCommit: commitWithParams,
        project: projectWithParams,
        workspace: workspaceWithParams,
      }).then((r) => r.unwrap())

      expect(result.optimization.trainsetId).not.toBeNull()
      expect(result.optimization.testsetId).not.toBeNull()

      const rowsRepository = new DatasetRowsRepository(workspaceWithParams.id)
      const trainCount = await rowsRepository.getCountByDataset(
        result.optimization.trainsetId!,
      )
      const testCount = await rowsRepository.getCountByDataset(
        result.optimization.testsetId!,
      )

      expect(trainCount! + testCount!).toBe(OPTIMIZATION_MAX_ROWS)
    })
  })
})
