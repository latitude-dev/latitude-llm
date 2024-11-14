import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { internalInfoSchema } from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/v2/conversations/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

export const evaluateRoute = createRoute({
  operationId: 'evaluateDocument',
  tags: ['Conversations'],
  method: http.Methods.POST,
  path: ROUTES.v2.conversations.evaluate,
  request: {
    params: conversationsParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: internalInfoSchema.extend({
            evaluationUuids: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'Evaluations were executed successfully',
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.array(z.string()).optional(),
        },
      },
    },
  },
})

export type EvaluateRoute = typeof evaluateRoute
