import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/v2/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

export const getRoute = createRoute({
  operationId: 'getDocument',
  method: http.Methods.POST,
  path: ROUTES.v2.documents.get,
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

export type GetRoute = typeof getRoute
