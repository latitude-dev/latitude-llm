import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { defineRouteConfig } from '$/routes/api/helpers'
import { z } from '@hono/zod-openapi'
import { documentParamsSchema } from '../paramsSchema'

export const getRouteConfig = defineRouteConfig({
  operationId: 'getDocument',
  method: http.Methods.GET,
  description: 'Get a prompt',
  tags: ['Documents'],
  request: {
    params: documentParamsSchema.extend({
      documentPath: z.string().openapi({
        description: 'Prompt path',
      }),
    }),
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

export type GetRoute = typeof getRouteConfig
