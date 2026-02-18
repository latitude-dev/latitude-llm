import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { z } from '@hono/zod-openapi'
import { documentParamsSchema } from '../paramsSchema'
import { defineRouteConfig } from '$/routes/api/helpers'

export const getOrCreateRouteConfig = defineRouteConfig({
  operationId: 'getOrCreateDocument',
  method: http.Methods.POST,
  description: 'Find or create a prompt',
  tags: ['Documents'],
  request: {
    params: documentParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            path: z.string(),
            prompt: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'The document was created or retrieved successfully',
      content: {
        [http.MediaTypes.JSON]: { schema: documentPresenterSchema },
      },
    },
  },
})

export type GetOrCreateRoute = typeof getOrCreateRouteConfig
