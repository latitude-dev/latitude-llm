import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { internalInfoSchema } from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/v2/conversations/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

function evaluateRouteFactory({
  path,
  tags,
}: {
  path: string
  tags: string[]
}) {
  return createRoute({
    operationId: 'evaluateDocument',
    path,
    tags,
    method: http.Methods.POST,
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
}

export const evaluateV2Route = evaluateRouteFactory({
  path: ROUTES.v2.conversations.evaluate,
  tags: ['V2_DEPRECATED'],
})

export const evaluateV3Route = evaluateRouteFactory({
  path: ROUTES.v3.conversations.evaluate,
  tags: ['Conversations'],
})

export type EvaluateRoute = typeof evaluateV3Route
