import { faker } from '@faker-js/faker'
import {
  Commit,
  DocumentVersion,
  EvaluationV2,
  User,
  Workspace,
} from '../../browser'
import { createExperiment as createExperimentFn } from '../../services/experiments/create'
import { createDataset, ICreateDatasetV2 } from './datasets'

export type ICreateExperiment = {
  name?: string
  document: DocumentVersion
  commit: Commit
  evaluations: EvaluationV2[]
  customPrompt?: string
  dataset?: ICreateDatasetV2
  parametersMap?: Record<string, number>
  datasetLabels?: Record<string, string>
  fromRow?: number
  toRow?: number
  user: User
  workspace: Workspace
}

export async function createExperiment(args: ICreateExperiment) {
  // Create or use existing dataset
  const fileContent = `input1,input2,output
  foo,bar,baz`
  const datasetResult = args.dataset
    ? await createDataset({
        ...args.dataset,
        workspace: args.workspace,
      })
    : await createDataset({
        workspace: args.workspace,
        author: args.user,
        fileContent,
      })

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
    dataset: datasetResult.dataset,
    parametersMap: args.parametersMap ?? {},
    datasetLabels,
    fromRow: args.fromRow,
    toRow: args.toRow,
    workspace: args.workspace,
  }).then((r) => r.unwrap())

  return {
    experiment,
    dataset: datasetResult.dataset,
    workspace: args.workspace,
  }
}
