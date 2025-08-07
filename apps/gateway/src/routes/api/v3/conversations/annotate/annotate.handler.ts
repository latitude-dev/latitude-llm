import { AppRouteHandler } from '$/openApi/types'
import { NotFoundError } from '@latitude-data/constants/errors'
import { HEAD_COMMIT } from '@latitude-data/core/browser'
import {
  findDocumentFromLog,
  findLastProviderLogFromDocumentLogUuid,
  findProjectFromDocument,
} from '@latitude-data/core/data-access'
import {
  CommitsRepository,
  DocumentLogsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import { annotateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/annotate'
import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { AnnotateRoute } from './annotate.route'
import { serializeEvaluationResultV2 } from './serializeEvaluationResultV2'

// @ts-expect-error: broken types
export const annotateHandler: AppRouteHandler<AnnotateRoute> = async (c) => {
  const { score, metadata, versionUuid = HEAD_COMMIT } = c.req.valid('json')
  const { conversationUuid, evaluationUuid } = c.req.valid('param')
  const workspace = c.get('workspace')
  const evaluationsRepo = new EvaluationsV2Repository(workspace.id)
  const providerLogsRepo = new DocumentLogsRepository(workspace.id)
  const documentLog = await providerLogsRepo
    .findByUuid(conversationUuid)
    .then((r) => r.unwrap())
  if (!documentLog) {
    throw new NotFoundError('Could not find log with uuid ${conversationUuid}')
  }
  const providerLog = await findLastProviderLogFromDocumentLogUuid(
    documentLog.uuid,
  )
  if (!providerLog) {
    throw new NotFoundError(
      `Could not find provider log for log ${documentLog.uuid}`,
    )
  }

  const document = await findDocumentFromLog(documentLog)
  if (!document) {
    throw new NotFoundError('Could not find prompt for this log')
  }

  const project = await findProjectFromDocument(document)
  if (!project) {
    throw new NotFoundError('Could not find project for this document')
  }

  const commitsRepo = new CommitsRepository(workspace.id)
  const commit = await commitsRepo
    .getCommitByUuid({
      uuid: versionUuid,
      projectId: project.id,
    })
    .then((r) => r.unwrap())
  if (!commit) {
    throw new NotFoundError(
      `Could not find version ${versionUuid} in project ${project.name}`,
    )
  }

  const evaluation = await evaluationsRepo
    .getAtCommitByDocument({
      documentUuid: documentLog.documentUuid,
      commitUuid: versionUuid,
      evaluationUuid,
      projectId: project.id,
    })
    .then((r) => r.unwrap())
  if (!evaluation) {
    throw new NotFoundError('Could not find evaluation for this version')
  }

  const { result: annotation } = await annotateEvaluationV2({
    providerLog: serializeProviderLog(providerLog),
    evaluation,
    resultScore: score,
    resultMetadata: metadata,
    commit,
    workspace: workspace,
  }).then((r) => r.unwrap())

  const data = serializeEvaluationResultV2(annotation, {
    commit: commit,
  })

  return c.json(data, 201)
}
