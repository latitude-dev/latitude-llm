import http from '$/common/http'
import { ROUTES } from '$/routes'
import { createRoute } from '@hono/zod-openapi'

export const createEvaluationResultRoute = createRoute({
  operationId: 'createEvaluationResult',
  tags: ['Conversations'],
  method: http.Methods.POST,
  path: ROUTES.api.v3.conversations.createEvaluationResult,
  responses: {
    [http.Status.PERMANENT_REDIRECT]: {
      description: '[DEPRECATED] Use the /annotate endpoint instead',
    },
  },
})

export type CreateEvaluationResultRoute = typeof createEvaluationResultRoute
