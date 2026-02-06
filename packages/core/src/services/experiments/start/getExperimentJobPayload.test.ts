import { LogSources, Providers, SpanType } from '@latitude-data/constants'
import { SimulatedUserGoalSource } from '@latitude-data/constants/simulation'
import { beforeEach, describe, expect, it } from 'vitest'
import { EvaluationV2 } from '../../../constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type Project } from '../../../schema/models/types/Project'
import * as factories from '../../../tests/factories'
import { createExperiment } from '../create'
import {
  getExperimentJobPayload,
  resolveGoalFromSource,
} from './getExperimentJobPayload'

describe('getExperimentJobPayload', () => {
  let workspace: Workspace
  let project: Project
  let document: DocumentVersion
  let commit: Commit
  let dataset: Dataset
  let author: Awaited<ReturnType<typeof factories.createProject>>['user']
  const parametersMap = {
    a: 0,
    b: 1,
    c: 2,
  }
  let evaluations: EvaluationV2[]
  let datasetLabels: Record<string, string>

  beforeEach(async () => {
    const {
      user,
      workspace: createdWorkspace,
      commit: createdCommit,
      project: createdProject,
      documents,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'content',
        }),
      },
    })
    workspace = createdWorkspace
    project = createdProject
    document = documents[0]!
    commit = createdCommit
    author = user

    const { dataset: createdDataset } = await factories.createDataset({
      workspace,
      author: user,
      fileContent: factories.generateCsvContent({
        headers: ['a', 'b', 'c'],
        rows: Array.from({ length: 50 }).map((_, i) => [
          `a${i}`,
          `b${i}`,
          `c${i}`,
        ]),
      }),
    })
    dataset = createdDataset

    evaluations = await Promise.all([
      factories.createEvaluationV2({
        workspace,
        commit,
        document,
      }),
      factories.createEvaluationV2({
        workspace,
        commit,
        document,
      }),
      factories.createEvaluationV2({
        workspace,
        commit,
        document,
      }),
    ])

    datasetLabels = {
      [evaluations[0]!.uuid]: 'c',
      [evaluations[1]!.uuid]: 'c',
      [evaluations[2]!.uuid]: 'c',
    }
  })

  it('Returns an array of all dataset selected rows', async () => {
    const experiment = await createExperiment({
      name: 'experiment1',
      workspace,
      document,
      commit,
      parametersPopulation: {
        source: 'dataset',
        dataset,
        parametersMap,
        datasetLabels,
        fromRow: 25,
        toRow: 40,
      },
      evaluations,
      simulationSettings: {
        simulateToolResponses: true,
      },
    }).then((r) => r.unwrap())

    const { rows } = await getExperimentJobPayload({
      experiment,
      workspace,
    }).then((r) => r.unwrap())

    expect(rows).toHaveLength(16)
    expect(rows[0]).toEqual({
      datasetRowId: expect.any(Number),
      uuid: expect.any(String),
      parameters: {
        a: 'a25',
        b: 'b25',
        c: 'c25',
      },
    })
  })

  it('Returns a fully populated array with the selected length when there is no dataset', async () => {
    const experiment = await createExperiment({
      name: 'experiment1',
      workspace,
      document,
      commit,
      parametersPopulation: {
        source: 'manual',
        count: 40,
        parametersMap,
      },
      evaluations: [],
      simulationSettings: {
        simulateToolResponses: true,
      },
    }).then((r) => r.unwrap())

    const { rows } = await getExperimentJobPayload({
      experiment,
      workspace,
    }).then((r) => r.unwrap())

    expect(rows).toHaveLength(40)
    expect(rows.some((row) => row === undefined)).toBe(false)
  })

  it('Creates a manual experiment with default count of 1 when no range specified', async () => {
    const experiment = await createExperiment({
      name: 'experiment1',
      workspace,
      document,
      commit,
      parametersPopulation: {
        source: 'manual',
        count: 1,
        parametersMap,
      },
      evaluations: [],
      simulationSettings: {
        simulateToolResponses: true,
      },
    }).then((r) => r.unwrap())

    const { rows } = await getExperimentJobPayload({
      experiment,
      workspace,
    }).then((r) => r.unwrap())

    expect(rows).toHaveLength(1)
    expect(experiment.metadata.parametersSource.source).toBe('manual')
    if (experiment.metadata.parametersSource.source === 'manual') {
      expect(experiment.metadata.parametersSource.count).toBe(1)
    }
  })

  it('Resolves simulatedUserGoal from global source', async () => {
    const experiment = await createExperiment({
      name: 'experiment-global-goal',
      workspace,
      document,
      commit,
      parametersPopulation: {
        source: 'dataset',
        dataset,
        parametersMap,
        datasetLabels,
        fromRow: 1,
        toRow: 3,
      },
      evaluations,
      simulationSettings: {
        simulateToolResponses: true,
        maxTurns: 3,
        simulatedUserGoalSource: {
          type: 'global',
          value: 'Complete the purchase flow',
        },
      },
    }).then((r) => r.unwrap())

    const { rows } = await getExperimentJobPayload({
      experiment,
      workspace,
    }).then((r) => r.unwrap())

    expect(rows).toHaveLength(3)
    rows.forEach((row) => {
      expect(row.simulatedUserGoal).toBe('Complete the purchase flow')
    })
  })

  it('Resolves simulatedUserGoal from dataset column', async () => {
    const { dataset: goalDataset } = await factories.createDataset({
      workspace,
      author,
      fileContent: factories.generateCsvContent({
        headers: ['a', 'b', 'goal'],
        rows: [
          ['a1', 'b1', 'Goal for row 1'],
          ['a2', 'b2', 'Goal for row 2'],
          ['a3', 'b3', 'Goal for row 3'],
        ],
      }),
    })

    const experiment = await createExperiment({
      name: 'experiment-column-goal',
      workspace,
      document,
      commit,
      parametersPopulation: {
        source: 'dataset',
        dataset: goalDataset,
        parametersMap: { a: 0, b: 1 },
        datasetLabels,
        fromRow: 1,
        toRow: 3,
      },
      evaluations,
      simulationSettings: {
        simulateToolResponses: true,
        maxTurns: 3,
        simulatedUserGoalSource: {
          type: 'column',
          columnIndex: 2,
        },
      },
    }).then((r) => r.unwrap())

    const { rows } = await getExperimentJobPayload({
      experiment,
      workspace,
    }).then((r) => r.unwrap())

    expect(rows).toHaveLength(3)
    const goals = rows.map((row) => row.simulatedUserGoal).sort()
    expect(goals).toEqual([
      'Goal for row 1',
      'Goal for row 2',
      'Goal for row 3',
    ])
  })

  it('Returns undefined simulatedUserGoal when no goalSource is provided', async () => {
    const experiment = await createExperiment({
      name: 'experiment-no-goal',
      workspace,
      document,
      commit,
      parametersPopulation: {
        source: 'dataset',
        dataset,
        parametersMap,
        datasetLabels,
        fromRow: 1,
        toRow: 2,
      },
      evaluations,
      simulationSettings: {
        simulateToolResponses: true,
      },
    }).then((r) => r.unwrap())

    const { rows } = await getExperimentJobPayload({
      experiment,
      workspace,
    }).then((r) => r.unwrap())

    expect(rows).toHaveLength(2)
    rows.forEach((row) => {
      expect(row.simulatedUserGoal).toBeUndefined()
    })
  })

  describe('logs source', () => {
    it('Returns rows from existing Prompt spans with their parameters', async () => {
      const baseDate = new Date()

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 3000),
        parameters: { foo: 'bar1', baz: 'qux1' },
      })

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 2000),
        parameters: { foo: 'bar2', baz: 'qux2' },
      })

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 1000),
        parameters: { foo: 'bar3', baz: 'qux3' },
      })

      const experiment = await createExperiment({
        name: 'experiment-from-logs',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 3,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(3)
      rows.forEach((row) => {
        expect(row.uuid).toBeDefined()
        expect(row.parameters).toBeDefined()
        expect(row.datasetRowId).toBeUndefined()
      })

      const allParams = rows.map((r) => r.parameters)
      expect(allParams).toContainEqual({ foo: 'bar1', baz: 'qux1' })
      expect(allParams).toContainEqual({ foo: 'bar2', baz: 'qux2' })
      expect(allParams).toContainEqual({ foo: 'bar3', baz: 'qux3' })
    })

    it('Limits rows to the requested count', async () => {
      const baseDate = new Date()

      for (let i = 0; i < 10; i++) {
        await factories.createPromptSpan({
          workspaceId: workspace.id,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          projectId: project.id,
          source: LogSources.API,
          startedAt: new Date(baseDate.getTime() - (10 - i) * 1000),
          parameters: { index: i.toString() },
        })
      }

      const experiment = await createExperiment({
        name: 'experiment-from-logs-limited',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 5,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(5)
    })

    it('Returns most recent spans first (ordered by startedAt desc)', async () => {
      const baseDate = new Date()

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 3000),
        parameters: { order: 'oldest' },
      })

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 1000),
        parameters: { order: 'newest' },
      })

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 2000),
        parameters: { order: 'middle' },
      })

      const experiment = await createExperiment({
        name: 'experiment-from-logs-ordered',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 2,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(2)
      expect(rows[0]!.parameters).toEqual({ order: 'newest' })
      expect(rows[1]!.parameters).toEqual({ order: 'middle' })
    })

    it('Only includes spans created before the experiment', async () => {
      const baseDate = new Date()

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 1000),
        parameters: { timing: 'before' },
      })

      const experiment = await createExperiment({
        name: 'experiment-from-logs-timing',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 10,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(),
        parameters: { timing: 'after' },
      })

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(1)
      expect(rows[0]!.parameters).toEqual({ timing: 'before' })
    })

    it('Only includes spans without an experimentUuid', async () => {
      const baseDate = new Date()

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 2000),
        parameters: { hasExperiment: 'no' },
        experimentUuid: undefined,
      })

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 1000),
        parameters: { hasExperiment: 'yes' },
        experimentUuid: '00000000-0000-0000-0000-000000000001',
      })

      const experiment = await createExperiment({
        name: 'experiment-from-logs-no-experiment',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 10,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(1)
      expect(rows[0]!.parameters).toEqual({ hasExperiment: 'no' })
    })

    it('Only includes spans for the same document', async () => {
      const baseDate = new Date()

      const { documents: otherDocuments } = await factories.createProject({
        workspace,
        providers: [{ type: Providers.OpenAI, name: 'openai-other' }],
        documents: {
          otherdoc: factories.helpers.createPrompt({
            provider: 'openai-other',
            content: 'other content',
          }),
        },
      })
      const otherDocument = otherDocuments[0]!

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 2000),
        parameters: { doc: 'correct' },
      })

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: otherDocument.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 1000),
        parameters: { doc: 'wrong' },
      })

      const experiment = await createExperiment({
        name: 'experiment-from-logs-same-doc',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 10,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(1)
      expect(rows[0]!.parameters).toEqual({ doc: 'correct' })
    })

    it('Returns empty array when no matching spans exist', async () => {
      const experiment = await createExperiment({
        name: 'experiment-from-logs-empty',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 5,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(0)
    })

    it('Returns empty parameters when span metadata is missing', async () => {
      const baseDate = new Date()

      await factories.createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 1000),
        type: SpanType.Prompt,
      })

      const experiment = await createExperiment({
        name: 'experiment-from-logs-no-metadata',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 5,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(1)
      expect(rows[0]!.parameters).toEqual({})
    })

    it('Does not include spans from other workspaces', async () => {
      const baseDate = new Date()
      const { workspace: otherWorkspace } = await factories.createWorkspace()

      await factories.createPromptSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 2000),
        parameters: { workspace: 'correct' },
      })

      await factories.createPromptSpan({
        workspaceId: otherWorkspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        source: LogSources.API,
        startedAt: new Date(baseDate.getTime() - 1000),
        parameters: { workspace: 'wrong' },
      })

      const experiment = await createExperiment({
        name: 'experiment-from-logs-workspace',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'logs',
          count: 10,
        },
        evaluations: [],
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const { rows } = await getExperimentJobPayload({
        experiment,
        workspace,
      }).then((r) => r.unwrap())

      expect(rows).toHaveLength(1)
      expect(rows[0]!.parameters).toEqual({ workspace: 'correct' })
    })
  })
})

describe('resolveGoalFromSource', () => {
  const mockDataset: Dataset = {
    id: 1,
    name: 'test-dataset',
    columns: [
      { identifier: 'col_a', name: 'a', role: 'parameter' },
      { identifier: 'col_b', name: 'b', role: 'parameter' },
      { identifier: 'col_goal', name: 'goal', role: 'parameter' },
    ],
    workspaceId: 1,
    authorId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    tags: [],
  }

  const mockRowValues: Record<string, unknown> = {
    col_a: 'value_a',
    col_b: 'value_b',
    col_goal: 'This is the goal from column',
  }

  it('returns undefined when goalSource is undefined', () => {
    const result = resolveGoalFromSource(undefined, mockDataset, mockRowValues)
    expect(result).toBeUndefined()
  })

  it('returns global value when goalSource type is global', () => {
    const goalSource: SimulatedUserGoalSource = {
      type: 'global',
      value: 'Global goal value',
    }
    const result = resolveGoalFromSource(goalSource, mockDataset, mockRowValues)
    expect(result).toBe('Global goal value')
  })

  it('returns undefined when global value is empty string', () => {
    const goalSource: SimulatedUserGoalSource = {
      type: 'global',
      value: '',
    }
    const result = resolveGoalFromSource(goalSource, mockDataset, mockRowValues)
    expect(result).toBeUndefined()
  })

  it('returns column value when goalSource type is column', () => {
    const goalSource: SimulatedUserGoalSource = {
      type: 'column',
      columnIndex: 2,
    }
    const result = resolveGoalFromSource(goalSource, mockDataset, mockRowValues)
    expect(result).toBe('This is the goal from column')
  })

  it('returns undefined when column index is out of bounds', () => {
    const goalSource: SimulatedUserGoalSource = {
      type: 'column',
      columnIndex: 999,
    }
    const result = resolveGoalFromSource(goalSource, mockDataset, mockRowValues)
    expect(result).toBeUndefined()
  })

  it('returns undefined when column value is not in row', () => {
    const goalSource: SimulatedUserGoalSource = {
      type: 'column',
      columnIndex: 0,
    }
    const emptyRowValues: Record<string, unknown> = {}
    const result = resolveGoalFromSource(
      goalSource,
      mockDataset,
      emptyRowValues,
    )
    expect(result).toBeUndefined()
  })
})
