import { and, desc, eq, isNull, lt } from 'drizzle-orm'
import { SimulatedUserGoalSource } from '@latitude-data/constants/simulation'
import { database } from '../../../client'
import { EvaluationV2, SpanType } from '../../../constants'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { NotFoundError } from '../../../lib/errors'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import {
  CommitsRepository,
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
} from '../../../repositories'
import { findProjectById } from '../../../queries/projects/findById'
import { spans } from '../../../schema/models/spans'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Experiment } from '../../../schema/models/types/Experiment'
import { Project } from '../../../schema/models/types/Project'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { getRowsFromRange } from '../../datasetRows/getRowsFromRange'
import { assertEvaluationRequirements } from '../assertRequirements'
import { isClickHouseSpansReadEnabled } from '../../workspaceFeatures/isClickHouseSpansReadEnabled'
import { getExperimentPromptSpansBefore } from '../../../queries/clickhouse/spans/getExperimentPromptSpansBefore'

export type ExperimentRow = {
  uuid: string
  parameters: Record<string, unknown>
  datasetRowId?: number
  simulatedUserGoal?: string
}

export function resolveGoalFromSource(
  goalSource: SimulatedUserGoalSource | undefined,
  dataset: Dataset,
  rowValues: Record<string, unknown>,
): string | undefined {
  if (!goalSource) return undefined

  if (goalSource.type === 'global') {
    return goalSource.value || undefined
  }

  if (goalSource.type === 'column') {
    const column = dataset.columns[goalSource.columnIndex]
    if (!column) return undefined
    return rowValues[column.identifier] as string | undefined
  }

  return undefined
}

async function getExperimentRows(
  {
    dataset,
    parametersMap,
    fromRow,
    toRow,
    simulatedUserGoalSource,
  }: {
    dataset: Dataset
    parametersMap: Record<string, number>
    fromRow?: number
    toRow?: number
    simulatedUserGoalSource?: SimulatedUserGoalSource
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
      simulatedUserGoal: resolveGoalFromSource(
        simulatedUserGoalSource,
        dataset,
        datasetRow.values,
      ),
    }
  })
}

async function getExperimentSpansRows(
  {
    workspace,
    experiment,
    document,
    count,
  }: {
    workspace: Workspace
    experiment: Experiment
    document: DocumentVersion
    count: number
  },
  db = database,
): Promise<ExperimentRow[]> {
  const shouldUseClickHouse = await isClickHouseSpansReadEnabled(
    workspace.id,
    db,
  )

  const spanResults = shouldUseClickHouse
    ? await getExperimentPromptSpansBefore({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        before: experiment.createdAt,
        limit: count,
      }).then((rows) =>
        rows.map((row) => ({ id: row.span_id, traceId: row.trace_id })),
      )
    : await db
        .select({
          id: spans.id,
          traceId: spans.traceId,
        })
        .from(spans)
        .where(
          and(
            eq(spans.workspaceId, workspace.id),
            eq(spans.documentUuid, document.documentUuid),
            lt(spans.startedAt, experiment.createdAt),
            isNull(spans.experimentUuid),
            eq(spans.type, SpanType.Prompt),
          ),
        )
        .orderBy(desc(spans.startedAt))
        .limit(count)

  if (spanResults.length === 0) return []

  const metadataRepo = new SpanMetadatasRepository(workspace.id)
  const metadatas = await metadataRepo.getBatch<SpanType.Prompt>(
    spanResults.map((s) => ({ traceId: s.traceId, spanId: s.id })),
  )

  return spanResults.map((span) => {
    const key = SpanMetadatasRepository.buildKey(span)
    const metadata = metadatas.get(key)

    return {
      uuid: generateUUIDIdentifier(),
      parameters: metadata?.parameters ?? {},
      datasetRowId: undefined,
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
  rows: ExperimentRow[]
}> {
  const commitResult = await new CommitsRepository(
    workspace.id,
    db,
  ).getCommitById(experiment.commitId)
  if (commitResult.error) return commitResult
  const commit = commitResult.unwrap()

  const project = await findProjectById(
    { workspaceId: workspace.id, id: commit.projectId },
    db,
  )
  if (!project) {
    return Result.error(new NotFoundError('Project not found'))
  }

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

    const rows = await getExperimentSpansRows(
      {
        workspace,
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
      rows: new Array(parametersSource.count).fill(undefined).map(
        () =>
          ({
            uuid: generateUUIDIdentifier(),
            parameters: {},
          }) satisfies ExperimentRow,
      ),
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

  const simulationSettings = experiment.metadata.simulationSettings
  const rows = await getExperimentRows(
    {
      dataset,
      parametersMap: parametersSource.parametersMap,
      fromRow: parametersSource.fromRow,
      toRow: parametersSource.toRow,
      simulatedUserGoalSource: simulationSettings?.simulatedUserGoalSource,
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
