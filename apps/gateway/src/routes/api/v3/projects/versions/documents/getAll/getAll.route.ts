import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { z } from '@hono/zod-openapi'
import { documentParamsSchema } from '../paramsSchema'
import { defineRouteConfig } from '$/routes/api/helpers'

export const getAllRouteConfig = defineRouteConfig({
  operationId: 'getDocument',
  method: http.Methods.GET,
  description: 'Get all prompts in a version',
  tags: ['Documents'],
  request: {
    params: documentParamsSchema,
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'The list of documents for a project at specific version',
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.array(documentPresenterSchema),
        },
      },
    },
  },
})

export type GetRoute = typeof getAllRouteConfig
