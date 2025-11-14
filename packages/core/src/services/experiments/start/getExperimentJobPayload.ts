import { database } from '../../../client'
import { EvaluationV2, LogSources } from '../../../constants'
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
import {
  and,
  desc,
  eq,
  getTableColumns,
  isNull,
  lt,
  notInArray,
} from 'drizzle-orm'
import { documentLogs } from '../../../schema/models/documentLogs'
import { commits } from '../../../schema/models/commits'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'

export type ExperimentRow = {
  uuid: string
  parameters: Record<string, unknown>
  datasetRowId?: number
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
  const { rows: datasetRows } = await getRowsFromRange(
    {
      dataset,
      fromLine: from,
      toLine: to,
    },
    db,
  )

  return datasetRows.map((datasetRow) => {
    return {
      datasetRowId: datasetRow.id,
      uuid: generateUUIDIdentifier(),
      parameters: Object.fromEntries(
        Object.entries(parametersMap!).map(([parameter, index]) => {
          const column = dataset.columns[index]!
          const value = datasetRow.values[column.identifier] as string

          return [parameter, value]
        }),
      ),
    }
  })
}

async function getExperimentLogsRows(
  {
    experiment,
    document,
    count,
  }: {
    experiment: Experiment
    document: DocumentVersion
    count: number
  },
  db = database,
): Promise<ExperimentRow[]> {
  // Fetch logs created before this experiment, excluding experiment logs
  const logs = await db
    .select(getTableColumns(documentLogs))
    .from(documentLogs)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
    )
    .where(
      and(
        eq(documentLogs.documentUuid, document.documentUuid),
        lt(documentLogs.createdAt, experiment.createdAt),
        notInArray(documentLogs.source, [LogSources.Experiment]),
      ),
    )
    .orderBy(desc(documentLogs.createdAt))
    .limit(count)

  return logs.map((log) => ({
    uuid: log.uuid,
    parameters: log.parameters,
    datasetRowId: undefined,
  }))
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
  rows: ExperimentRow[]
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

  const parametersSource = experiment.metadata.parametersSource

  // Handle different parameter sources
  if (parametersSource.source === 'logs') {
    const requirementsResult = assertEvaluationRequirements({
      evaluations,
      datasetLabels: {},
    })

    if (requirementsResult.error) return requirementsResult

    const rows = await getExperimentLogsRows(
      {
        experiment,
        document,
        count: parametersSource.count,
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

  if (parametersSource.source === 'manual') {
    const requirementsResult = assertEvaluationRequirements({
      evaluations,
      datasetLabels: {},
    })

    if (requirementsResult.error) return requirementsResult

    return Result.ok({
      project,
      commit,
      document,
      evaluations,
      rows: new Array(parametersSource.count).fill(undefined),
    })
  }

  // Handle dataset source
  const requirementsResult = assertEvaluationRequirements({
    evaluations,
    datasetLabels: parametersSource.datasetLabels,
  })

  if (requirementsResult.error) return requirementsResult

  if (!experiment.datasetId) {
    return Result.error(
      new Error('Dataset source requires a dataset to be specified'),
    )
  }

  const datasetScope = new DatasetsRepository(workspace.id, db)
  const datasetResult = await datasetScope.find(experiment.datasetId)
  if (datasetResult.error) return datasetResult
  const dataset = datasetResult.unwrap()

  const rows = await getExperimentRows(
    {
      dataset,
      parametersMap: parametersSource.parametersMap,
      fromRow: parametersSource.fromRow,
      toRow: parametersSource.toRow,
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
