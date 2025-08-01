import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'
import { documentParamsSchema } from '../paramsSchema'

function getRouteFactory({ path, tags }: { path: string; tags: string[] }) {
  return createRoute({
    operationId: 'getDocument',
    method: http.Methods.GET,
    description: 'Get a prompt',
    path,
    tags,
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
}

export const getRouteV3 = getRouteFactory({
  path: ROUTES.api.v3.projects.documents.get,
  tags: ['Documents'],
})

export type GetRoute = typeof getRouteV3
