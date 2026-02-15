import { Context } from '@temporalio/activity'
import { SpanType } from '../../../../constants'
import { unsafelyFindWorkspace } from '../../../../data-access/workspaces'
import { NotFoundError } from '../../../../lib/errors'
import {
  CommitsRepository,
  DatasetRowsRepository,
  DatasetsRepository,
  EvaluationsV2Repository,
  ExperimentsRepository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../../repositories'
import { runEvaluationV2 } from '../../../../services/evaluationsV2/run'
import { captureException } from '../../../../utils/datadogCapture'

type RunEvaluationResult = {
  success: boolean
  hasPassed?: boolean
  score?: number
  error?: string
}

export async function runEvaluationActivityHandler({
  workspaceId,
  commitId,
  evaluationUuid,
  conversationUuid,
  experimentUuid,
  datasetId,
  datasetLabel,
  datasetRowId,
}: {
  workspaceId: number
  commitId: number
  evaluationUuid: string
  conversationUuid: string
  experimentUuid: string
  datasetId?: number
  datasetLabel?: string
  datasetRowId?: number
}): Promise<RunEvaluationResult> {
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    throw new NotFoundError(`Workspace not found: ${workspaceId}`)
  }

  Context.current().heartbeat(`Evaluating ${evaluationUuid}`)

  const spansRepo = new SpansRepository(workspace.id)
  const spansMetadataRepo = new SpanMetadatasRepository(workspace.id)

  const traceId = await spansRepo.getLastTraceByLogUuid(conversationUuid)
  if (!traceId) {
    return { success: false, error: 'Trace not found' }
  }

  const spans = await spansRepo
    .list({ traceId })
    .then((r) => r.unwrap().filter((span) => span.type === SpanType.Prompt))

  const span = spans[0]
  if (!span) {
    return { success: false, error: 'Span not found' }
  }

  try {
    const commitsRepository = new CommitsRepository(workspace.id)
    const commit = await commitsRepository
      .getCommitById(commitId)
      .then((r) => r.unwrap())

    const metadata = await spansMetadataRepo
      .get({ spanId: span.id, traceId })
      .then((r) => r.unwrap())

    const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
    const evaluation = await evaluationsRepository
      .getAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid: span.documentUuid!,
        evaluationUuid: evaluationUuid,
      })
      .then((r) => r.unwrap())

    const experimentsRepository = new ExperimentsRepository(workspace.id)
    const experiment = await experimentsRepository
      .findByUuid(experimentUuid)
      .then((r) => r.unwrap())

    let dataset = undefined
    if (datasetId) {
      const datasetsRepository = new DatasetsRepository(workspace.id)
      dataset = await datasetsRepository.find(datasetId).then((r) => r.unwrap())
    }

    let datasetRow = undefined
    if (datasetRowId) {
      const rowsRepository = new DatasetRowsRepository(workspace.id)
      datasetRow = await rowsRepository
        .find(datasetRowId)
        .then((r) => r.unwrap())
    }

    const { result } = await runEvaluationV2({
      evaluation,
      span: { ...span, metadata } as any,
      experiment,
      dataset,
      datasetLabel,
      datasetRow,
      commit,
      workspace,
    }).then((r) => r.unwrap())

    return {
      success: !result.error,
      hasPassed: result.hasPassed ?? undefined,
      score: result.normalizedScore ?? undefined,
      error: result.error ? String(result.error) : undefined,
    }
  } catch (error) {
    captureException(error as Error)
    return {
      success: false,
      error: (error as Error).message,
    }
  }
}
