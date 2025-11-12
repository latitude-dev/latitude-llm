import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'

function createRouteFactory({ path, tags }: { path: string; tags: string[] }) {
  return createRoute({
    operationId: 'createOrUpdateDocument',
    method: http.Methods.POST,
    description:
      'Create or update a prompt. By default, this endpoint only works with draft commits. Use force=true to allow modifications to the live commit.',
    path,
    tags,
    request: {
      params: z.object({
        projectId: z.string(),
        versionUuid: z.string().optional(),
      }),
      body: {
        content: {
          [http.MediaTypes.JSON]: {
            schema: z.object({
              path: z.string(),
              prompt: z.string(),
              force: z.boolean().optional().default(false),
            }),
          },
        },
      },
    },
    responses: {
      ...GENERIC_ERROR_RESPONSES,
      [http.Status.OK]: {
        description: 'The document was created or updated successfully',
        content: {
          [http.MediaTypes.JSON]: { schema: documentPresenterSchema },
        },
      },
    },
  })
}

export const createOrUpdateDocumentRoute = createRouteFactory({
  path: ROUTES.api.v3.projects.documents.createOrUpdate,
  tags: ['Documents'],
})

export type CreateOrUpdateDocumentRoute = typeof createOrUpdateDocumentRoute
