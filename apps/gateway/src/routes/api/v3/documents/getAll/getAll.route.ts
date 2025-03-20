import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v2/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

function getRouteFactory({ path, tags }: { path: string; tags: string[] }) {
  return createRoute({
    operationId: 'getDocument',
    method: http.Methods.GET,
    path,
    tags,
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
}

export const getAllRoute = getRouteFactory({
  path: ROUTES.api.v3.documents.getAll,
  tags: ['V3_DEPRECATED'],
})

export type GetRoute = typeof getAllRoute
