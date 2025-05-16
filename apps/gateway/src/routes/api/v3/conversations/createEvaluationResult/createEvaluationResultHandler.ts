import { AppRouteHandler } from '$/openApi/types'
import { ROUTES } from '$/routes'
import { CreateEvaluationResultRoute } from './createEvaluationResultRoute'

export const createEvaluationResultHandler: AppRouteHandler<
  CreateEvaluationResultRoute
> = (c) => {
  return c.redirect(ROUTES.api.v3.conversations.annotate)
}
