import { faker } from '@faker-js/faker'
import { EvaluationV2, LogSources } from '../../constants'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createExperiment as createExperimentFn } from '../../services/experiments/create'
import { createDataset, ICreateDatasetV2 } from './datasets'
import { createDocumentLog } from './documentLogs'
import { createEvaluationResultV2 } from './evaluationResultsV2'
import { createProviderLog } from './providerLogs'
import { SimulationSettings } from '@latitude-data/constants/simulation'

export type ICreateExperiment = {
  name?: string
  document: DocumentVersion
  commit: Commit
  evaluations: EvaluationV2[]
  customPrompt?: string
  dataset?: Dataset | ICreateDatasetV2
  parametersMap?: Record<string, number>
  datasetLabels?: Record<string, string>
  fromRow?: number
  toRow?: number
  simulationSettings?: SimulationSettings
  user: User
  workspace: Workspace
}

export async function createExperiment(args: ICreateExperiment) {
  let dataset
  if (args.dataset && 'id' in args.dataset) dataset = args.dataset
  else if (args.dataset) {
    const { dataset: d } = await createDataset({
      ...args.dataset,
      workspace: args.workspace,
    })
    dataset = d
  } else {
    const { dataset: d } = await createDataset({
      workspace: args.workspace,
      author: args.user,
      fileContent: `
input1,input2,output
foo,bar,baz
`.trim(),
    })
    dataset = d
  }

  const datasetLabels =
    args.datasetLabels ??
    args.evaluations.reduce<Record<string, string>>((acc, evall) => {
      acc[evall.uuid] = 'output'
      return acc
    }, {})

  const experiment = await createExperimentFn({
    name: args.name ?? faker.commerce.productName(),
    document: args.document,
    commit: args.commit,
    evaluations: args.evaluations,
    customPrompt: args.customPrompt,
    dataset: dataset,
    parametersMap: args.parametersMap ?? {},
    datasetLabels,
    fromRow: args.fromRow,
    toRow: args.toRow,
    workspace: args.workspace,
    simulationSettings: args.simulationSettings ?? {
      simulateToolResponses: true,
    },
  }).then((r) => r.unwrap())

  return {
    experiment,
    dataset: dataset,
    workspace: args.workspace,
  }
}

export async function createExperimentResults({
  workspace,
  commit,
  document,
  provider,
  experiment,
  costInMillicents,
  duration,
  scores,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  provider: ProviderApiKey
  experiment: Experiment
  costInMillicents: number
  duration: number
  scores: { evaluation: EvaluationV2; score: number }[]
}) {
  const { documentLog } = await createDocumentLog({
    document,
    commit,
    source: LogSources.Experiment,
    experimentId: experiment.id,
    totalDuration: duration,
    skipProviderLogs: true,
  })

  const providerLog = await createProviderLog({
    workspace,
    documentLogUuid: documentLog.uuid,
    providerId: provider.id,
    providerType: provider.provider,
    source: LogSources.Experiment,
    costInMillicents,
    duration,
  })

  for await (const { evaluation, score } of scores) {
    await createEvaluationResultV2({
      workspace,
      evaluation,
      experiment,
      commit,
      providerLog,
      score,
      normalizedScore: score,
    })
  }
}
