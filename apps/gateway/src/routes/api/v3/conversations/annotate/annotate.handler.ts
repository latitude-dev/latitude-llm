import { AppRouteHandler } from '$/openApi/types'
import { AnnotateRoute } from './annotate.route'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { enqueueAnnotateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/enqueueAnnotation'

// @ts-expect-error: broken types
export const annotateHandler: AppRouteHandler<AnnotateRoute> = async (c) => {
  const {
    score,
    metadata,
    versionUuid = HEAD_COMMIT,
    context,
  } = c.req.valid('json')
  const { conversationUuid, evaluationUuid } = c.req.valid('param')
  const workspace = c.get('workspace')
  const resultUuid = generateUUIDIdentifier()
  await enqueueAnnotateEvaluationV2({
    workspaceId: workspace.id,
    conversationUuid,
    evaluationUuid,
    score,
    metadata,
    context,
    versionUuid,
    resultUuid,
  }).then((r) => r.unwrap())

  return c.json(
    {
      status: 'accepted',
      message: 'Annotation queued for asynchronous processing',
      resultUuid,
    },
    202,
  )
}
