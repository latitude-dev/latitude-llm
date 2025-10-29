import { database } from '../../../client'
import { EvaluationV2 } from '../../../constants'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { NotFoundError } from '../../../lib/errors'
import {
  CommitsRepository,
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  ProjectsRepository,
} from '../../../repositories'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Experiment } from '../../../schema/models/types/Experiment'
import { Project } from '../../../schema/models/types/Project'
import { type Workspace } from '../../../schema/models/types/Workspace'
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
          const column = dataset.columns[index]!
          const value = row.values[column.identifier] as string

          return [parameter, value]
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
  project: Project
  commit: Commit
  document: DocumentVersion
  evaluations: EvaluationV2[]
  rows: (ExperimentRow | undefined)[]
}> {
  const commitResult = await new CommitsRepository(
    workspace.id,
    db,
  ).getCommitById(experiment.commitId)
  if (commitResult.error) return commitResult
  const commit = commitResult.unwrap()

  const projectResult = await new ProjectsRepository(workspace.id, db).find(
    commit.projectId,
  )
  if (projectResult.error) return projectResult
  const project = projectResult.unwrap()

  const documentScope = new DocumentVersionsRepository(workspace.id, db)
  const documentResult = await documentScope.getDocumentAtCommit({
    projectId: commit.projectId,
    commitUuid: commit.uuid,
    documentUuid: experiment.documentUuid,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.unwrap()

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

  const evaluations = experiment.evaluationUuids.map((uuid) =>
    documentEvaluations.find((e) => e.uuid === uuid),
  ) as EvaluationV2[]

  const missingEvalIndex = evaluations.findIndex((evaluation) => !evaluation)
  if (missingEvalIndex !== -1) {
    const missingEvalUuid = experiment.evaluationUuids[missingEvalIndex]!
    return Result.error(
      new NotFoundError(
        `Evaluation '${missingEvalUuid}' not found in commit '${commit.uuid}'`,
      ),
    )
  }

  const requirementsResult = assertEvaluationRequirements({
    evaluations,
    datasetLabels: experiment.metadata.datasetLabels,
  })

  if (requirementsResult.error) return requirementsResult

  if (!experiment.datasetId) {
    const from = experiment.metadata.fromRow
    const to = experiment.metadata.toRow

    if (from === undefined || to === undefined) {
      return Result.error(
        new Error('Experiments without a dataset must have a range defined'),
      )
    }

    return Result.ok({
      project,
      commit,
      document,
      evaluations,
      rows: new Array(to - from + 1).fill(undefined),
    })
  }

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
    project,
    commit,
    document,
    evaluations,
    rows,
  })
}
