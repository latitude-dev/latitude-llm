import { zValidator } from '@hono/zod-validator'
import { DocumentLog, EvaluationDto } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  DocumentLogsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { evaluateDocumentLog } from '@latitude-data/core/services/documentLogs/evaluate'
import { captureException } from '$/common/sentry'
import { Factory } from 'hono/factory'
import { z } from 'zod'

const factory = new Factory()

export const evaluateHandler = factory.createHandlers(
  zValidator(
    'json',
    z
      .object({
        evaluationUuids: z.array(z.string()).optional(),
      })
      .optional()
      .default({}),
  ),
  async (c) => {
    const { conversationUuid } = c.req.param()
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
  },
)
