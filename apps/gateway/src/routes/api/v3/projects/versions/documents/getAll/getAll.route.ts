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
    description: 'Get all prompts in a version',
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
  path: ROUTES.api.v3.projects.documents.getAll,
  tags: ['Documents'],
})

export type GetRoute = typeof getAllRoute
