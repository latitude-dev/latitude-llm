import { randomUUID } from 'crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { EvaluationV2 } from '../constants'
import { NotFoundError } from '../lib/errors'
import { type Commit } from '../schema/models/types/Commit'
import { type Dataset } from '../schema/models/types/Dataset'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type ProviderApiKey } from '../schema/models/types/ProviderApiKey'
import { type Workspace } from '../schema/models/types/Workspace'
import { createExperiment } from '../services/experiments'
import * as factories from '../tests/factories'
import { ExperimentsRepository } from './experimentsRepository'

describe('ExperimentsRepository', () => {
  let workspace: Workspace
  let document: DocumentVersion
  let provider: ProviderApiKey
  let commit: Commit
  let dataset: Dataset
  const parametersMap = {
    a: 1,
    b: 2,
    c: 3,
  }
  let evaluations: EvaluationV2[]
  let datasetLabels: Record<string, string>

  let repo: ExperimentsRepository

  beforeEach(async () => {
    const {
      user,
      workspace: createdWorkspace,
      commit: createdCommit,
      documents,
      providers,
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
    provider = providers[0]!
    document = documents[0]!
    commit = createdCommit

    const { dataset: createdDataset } = await factories.createDataset({
      workspace,
      author: user,
      fileContent: factories.generateCsvContent({
        headers: ['a', 'b', 'c'],
        rows: Array.from({ length: 1 }).map((_, i) => [
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

    repo = new ExperimentsRepository(workspace.id)
  })

  describe('findByDocumentUuid', () => {
    it('returns all experiments created for the document with results aggregated', async () => {
      const experiment1 = await createExperiment({
        name: 'experiment1',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'dataset',
          dataset,
          parametersMap,
          datasetLabels,
          fromRow: 0,
          toRow: 1,
        },
        evaluations,
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      const experiment2 = await createExperiment({
        name: 'experiment2',
        workspace,
        document,
        commit,
        parametersPopulation: {
          source: 'dataset',
          dataset,
          parametersMap,
          datasetLabels,
          fromRow: 0,
          toRow: 1,
        },
        evaluations,
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      // Create experiment results (documentLogs + evaluationResults)
      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment: experiment1,
        costInMillicents: 100,
        duration: 100,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 10,
        })),
      })

      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment: experiment1,
        costInMillicents: 200,
        duration: 200,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 20,
        })),
      })

      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment: experiment2,
        costInMillicents: 400,
        duration: 400,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 40,
        })),
      })

      const results = await repo.findByDocumentUuid({
        documentUuid: document.documentUuid,
        page: 1,
        pageSize: 10,
      })

      expect(results).toBeDefined()
      expect(results.length).toBe(2)

      const experiment1Result = results.find(
        (experiment) => experiment.id === experiment1.id,
      )
      const experiment2Result = results.find(
        (experiment) => experiment.id === experiment2.id,
      )
      expect(experiment1Result).toBeDefined()
      expect(experiment2Result).toBeDefined()

      expect(experiment1Result?.results.passed).toBe(2 * evaluations.length)
      expect(experiment1Result?.results.failed).toBe(0)
      expect(experiment1Result?.results.totalScore).toBe(
        10 * evaluations.length + 20 * evaluations.length,
      )

      expect(experiment2Result?.results.passed).toBe(1 * evaluations.length)
      expect(experiment2Result?.results.failed).toBe(0)
      expect(experiment2Result?.results.totalScore).toBe(
        40 * evaluations.length,
      )
    })

    it('returns an empty array if no experiments are found', async () => {
      const results = await repo.findByDocumentUuid({
        documentUuid: document.documentUuid,
        page: 1,
        pageSize: 10,
      })

      expect(results).toBeDefined()
      expect(results.length).toBe(0)
    })
  })

  describe('findByUuid', () => {
    it('returns the experiment with the given uuid, with results aggregated', async () => {
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
          fromRow: 0,
          toRow: 1,
        },
        evaluations,
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment,
        costInMillicents: 100,
        duration: 100,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 10,
        })),
      })

      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment,
        costInMillicents: 200,
        duration: 200,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 20,
        })),
      })
      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment,
        costInMillicents: 400,
        duration: 400,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 40,
        })),
      })

      const result = await repo.findByUuid(experiment.uuid)

      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      const experimentResult = result.unwrap()
      expect(experimentResult).toBeDefined()
      expect(experimentResult.uuid).toBe(experiment.uuid)
      expect(experimentResult.name).toBe(experiment.name)
      expect(experimentResult.results.passed).toBe(3 * evaluations.length)
      expect(experimentResult.results.failed).toBe(0)
      expect(experimentResult.results.totalScore).toBe(
        (10 + 20 + 40) * evaluations.length,
      )
    })

    it('throws NotFoundError if the experiment is not found', async () => {
      const result = await repo.findByUuid(randomUUID())

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })
  })

  describe('getScores', () => {
    it('returns the scores for each experiment', async () => {
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
          fromRow: 0,
          toRow: 1,
        },
        evaluations,
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment,
        costInMillicents: 100,
        duration: 100,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 10,
        })),
      })

      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment,
        costInMillicents: 200,
        duration: 200,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 20,
        })),
      })

      const result = await repo.getScores(experiment.uuid)

      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      const scores = result.unwrap()
      expect(scores).toBeDefined()

      expect(Object.keys(scores).length).toBe(evaluations.length)
      expect(scores[evaluations[0]!.uuid]?.totalNormalizedScore).toBe(10 + 20)
      expect(scores[evaluations[0]!.uuid]?.count).toBe(2)
      expect(scores[evaluations[1]!.uuid]?.totalNormalizedScore).toBe(10 + 20)
      expect(scores[evaluations[1]!.uuid]?.count).toBe(2)
      expect(scores[evaluations[2]!.uuid]?.totalNormalizedScore).toBe(10 + 20)
      expect(scores[evaluations[2]!.uuid]?.count).toBe(2)
    })

    it('throws NotFoundError if the experiment is not found', async () => {
      const result = await repo.getScores(randomUUID())

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })
  })

  describe('getLogsMetadata', () => {
    it('returns the logs metadata for the experiment', async () => {
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
          fromRow: 0,
          toRow: 1,
        },
        evaluations,
        simulationSettings: {
          simulateToolResponses: true,
        },
      }).then((r) => r.unwrap())

      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment,
        costInMillicents: 100,
        duration: 100,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 10,
        })),
      })
      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment,
        costInMillicents: 200,
        duration: 200,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 20,
        })),
      })
      await factories.createExperimentResults({
        workspace,
        commit,
        document,
        provider,
        experiment,
        costInMillicents: 400,
        duration: 400,
        scores: evaluations.map((evaluation) => ({
          evaluation,
          score: 40,
        })),
      })

      const result = await repo.getLogsMetadata(experiment.uuid)

      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      const logsMetadata = result.unwrap()
      expect(logsMetadata).toBeDefined()
      expect(logsMetadata.count).toBe(3)
      expect(logsMetadata.totalCost).toBe(100 + 200 + 400)
      expect(logsMetadata.totalDuration).toBe(100 + 200 + 400)
    })
  })
})
