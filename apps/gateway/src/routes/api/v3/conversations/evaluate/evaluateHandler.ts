import { AppRouteHandler } from '$/openApi/types'
import { EvaluateRoute } from './evaluateRoute'

export const evaluateHandler: AppRouteHandler<EvaluateRoute> = (c) => {
  return c.text('Deprecated', 410)
}
