import {
  Commit,
  Dataset,
  EvaluationV2,
  Experiment,
  Workspace,
} from '../../../browser'
import { database } from '../../../client'
import { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { NotFoundError } from '../../../lib/errors'
import {
  CommitsRepository,
  DatasetsRepository,
  EvaluationsV2Repository,
} from '../../../repositories'
import { getRowsFromRange } from '../../datasetRows/getRowsFromRange'
import { assertEvaluationRequirements } from '../assertRequirements'

export type ExperimentRow = {
  id: number
  parameters: Record<string, string>
}

async function getExperimentRows(
  {
    dataset,
    parametersMap,
    fromRow,
    toRow,
  }: {
    dataset: Dataset
    parametersMap: Record<string, number>
    fromRow?: number
    toRow?: number
  },
  db = database,
): Promise<ExperimentRow[]> {
  const from = fromRow ? Math.abs(fromRow) : 1
  const to = toRow ? Math.abs(toRow) : undefined
  const { rows } = await getRowsFromRange(
    {
      dataset,
      fromLine: from,
      toLine: to,
    },
    db,
  )

  return rows.map((row) => {
    return {
      id: row.id,
      parameters: Object.fromEntries(
        Object.entries(parametersMap!).map(([parameter, index]) => {
          return [
            parameter,
            (row.values as Record<string, string>)[
              dataset.columns[index]!.identifier
            ]!,
          ]
        }),
      ),
    }
  })
}

export async function getExperimentJobPayload(
  {
    experiment,
    workspace,
  }: {
    experiment: Experiment
    workspace: Workspace
  },
  db = database,
): PromisedResult<{
  commit: Commit
  evaluations: EvaluationV2[]
  rows: ExperimentRow[]
}> {
  const commitResult = await new CommitsRepository(
    workspace.id,
    db,
  ).getCommitById(experiment.commitId)
  if (commitResult.error) return commitResult
  const commit = commitResult.unwrap()

  const evaluationScope = new EvaluationsV2Repository(workspace.id, db)
  const documentEvaluationsResult =
    await evaluationScope.listAtCommitByDocument({
      projectId: commit.projectId,
      commitUuid: commit.uuid,
      documentUuid: experiment.documentUuid,
    })
  if (documentEvaluationsResult.error) {
    return Result.error(documentEvaluationsResult.error as Error)
  }
  const documentEvaluations = documentEvaluationsResult.unwrap()

  const evaluations = experiment.evaluationUuids.map((uuid) => {
    const evaluation = documentEvaluations.find((e) => e.uuid === uuid)
    if (!evaluation) {
      throw new NotFoundError(
        `Evaluation '${uuid}' not found in commit '${commit.uuid}'`,
      )
    }
    return evaluation
  })

  const requirementsResult = assertEvaluationRequirements({
    evaluations,
    datasetLabels: experiment.metadata.datasetLabels,
  })

  if (requirementsResult.error) throw requirementsResult.error

  const datasetScope = new DatasetsRepository(workspace.id, db)
  const datasetResult = await datasetScope.find(experiment.datasetId)
  if (datasetResult.error) return datasetResult
  const dataset = datasetResult.unwrap()

  const rows = await getExperimentRows(
    {
      dataset,
      ...experiment.metadata,
    },
    db,
  )

  return Result.ok({
    commit,
    evaluations,
    rows,
  })
}
