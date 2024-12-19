import { DocumentLog, EvaluationDto } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  DocumentLogsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { evaluateDocumentLog } from '@latitude-data/core/services/documentLogs/evaluate'
import { captureException } from '$/common/sentry'
import { AppRouteHandler } from '$/openApi/types'
import { EvaluateRoute } from '$/routes/v2/conversations/evaluate/evaluate.route'

// @ts-expect-error: streamSSE has type issues
export const evaluateHandler: AppRouteHandler<EvaluateRoute> = async (c) => {
  const { conversationUuid } = c.req.valid('param')
  const { evaluationUuids } = c.req.valid('json')
  const workspace = c.get('workspace')

  const repo = new DocumentLogsRepository(workspace.id)
  let documentLog: DocumentLog
  try {
    documentLog = await repo
      .findByUuid(conversationUuid!)
      .then((r) => r.unwrap())
  } catch (e) {
    captureException(e as Error)

    throw new NotFoundError('Document log not found')
  }

  const evaluationsRepo = new EvaluationsRepository(workspace.id)
  let evaluations: EvaluationDto[] | undefined = []

  if (evaluationUuids) {
    evaluations = await evaluationsRepo
      .filterByUuids(evaluationUuids)
      .then((r) => r.unwrap())
  } else {
    evaluations = await evaluationsRepo
      .findByDocumentUuid(documentLog.documentUuid)
      .then((r) => r.unwrap())
  }

  evaluateDocumentLog(documentLog, workspace, { evaluations })

  return c.json({ evaluations: evaluations?.map((e) => e.uuid) ?? [] })
}
