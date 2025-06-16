import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'

function createRouteFactory({ path, tags }: { path: string; tags: string[] }) {
  return createRoute({
    operationId: 'createDocument',
    method: http.Methods.POST,
    description: 'Create a prompt',
    path,
    tags,
    request: {
      params: z.object({
        projectId: z.string(),
        commitUuid: z.string().optional(),
      }),
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
        description: 'The document was created successfully',
        content: {
          [http.MediaTypes.JSON]: { schema: documentPresenterSchema },
        },
      },
    },
  })
}

export const createDocumentRoute = createRouteFactory({
  path: ROUTES.api.v3.projects.documents.create,
  tags: ['Documents'],
})

export type CreateDocumentRoute = typeof createDocumentRoute
