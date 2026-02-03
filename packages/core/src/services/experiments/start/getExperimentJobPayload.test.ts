import { Providers } from '@latitude-data/constants'
import { SimulatedUserGoalSource } from '@latitude-data/constants/simulation'
import { beforeEach, describe, expect, it } from 'vitest'
import { EvaluationV2 } from '../../../constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import { createExperiment } from '../create'
import {
  getExperimentJobPayload,
  resolveGoalFromSource,
} from './getExperimentJobPayload'

describe('getExperimentJobPayload', () => {
  let workspace: Workspace
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
