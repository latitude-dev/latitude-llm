import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v2/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

function getOrCreateRouteFactory({
  path,
  tags,
}: {
  path: string
  tags: string[]
}) {
  return createRoute({
    operationId: 'getOrCreateDocument',
    method: http.Methods.POST,
    path,
    tags,
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
}

export const getOrCreateRouteV2 = getOrCreateRouteFactory({
  path: ROUTES.api.v2.documents.getOrCreate,
  tags: ['V2_DEPRECATED'],
})

export const getOrCreateRouteV3 = getOrCreateRouteFactory({
  path: ROUTES.api.v3.documents.getOrCreate,
  tags: ['V3_DEPRECATED'],
})

export type GetOrCreateRoute = typeof getOrCreateRouteV3
