import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import { EvaluationV2 } from '../../../constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import { createExperiment } from '../create'
import { getExperimentJobPayload } from './getExperimentJobPayload'

describe('getExperimentJobPayload', () => {
  let workspace: Workspace
  let document: DocumentVersion
  let commit: Commit
  let dataset: Dataset
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
      dataset,
      parametersMap,
      datasetLabels,
      evaluations,
      fromRow: 25,
      toRow: 40,
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
      id: expect.any(Number),
      parameters: {
        a: 'a25',
        b: 'b25',
        c: 'c25',
      },
    })
  })

  it('Returns an undefined array with the selected length when there is no dataset', async () => {
    const experiment = await createExperiment({
      name: 'experiment1',
      workspace,
      document,
      commit,
      dataset: undefined,
      parametersMap,
      datasetLabels,
      evaluations,
      toRow: 39,
      simulationSettings: {
        simulateToolResponses: true,
      },
    }).then((r) => r.unwrap())

    const { rows } = await getExperimentJobPayload({
      experiment,
      workspace,
    }).then((r) => r.unwrap())

    expect(rows).toHaveLength(40)
    expect(rows.some((row) => row !== undefined)).toBe(false)
  })

  it('Fails if there is no dataset and no range', async () => {
    const experiment = await createExperiment({
      name: 'experiment1',
      workspace,
      document,
      commit,
      dataset: undefined,
      parametersMap,
      datasetLabels,
      evaluations,
      simulationSettings: {
        simulateToolResponses: true,
      },
    }).then((r) => r.unwrap())

    const result = await getExperimentJobPayload({
      experiment,
      workspace,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })
})
