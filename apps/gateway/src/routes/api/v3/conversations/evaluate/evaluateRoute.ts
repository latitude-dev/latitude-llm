import http from '$/common/http'
import { ROUTES } from '$/routes'
import { createRoute } from '@hono/zod-openapi'

export const evaluateRoute = createRoute({
  operationId: 'evaluate',
  tags: ['Conversations'],
  method: http.Methods.POST,
  path: ROUTES.api.v3.conversations.evaluate,
  responses: {
    [http.Status.GONE]: {
      description: '[DEPRECATED]',
    },
  },
})

export type EvaluateRoute = typeof evaluateRoute
