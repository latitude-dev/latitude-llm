import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v2/documents/paramsSchema'
import { createRoute, RouteConfig, z } from '@hono/zod-openapi'
import {
  documentDataSchema,
  updateDocumentDataSchema,
} from '@latitude-data/constants'

const updatePromptRouteFactory = ({
  path,
  method,
}: {
  path: string
  method: RouteConfig['method']
}) =>
  createRoute({
    operationId: 'updatePrompt',
    method,
    path,
    tags: ['Project Management', 'Prompts', 'Update'],
    request: {
      params: documentParamsSchema.extend({
        documentUuid: z.string().openapi({
          description: 'Document UUID',
        }),
        data: updateDocumentDataSchema.openapi({
          description: 'Data to update from the prompt',
        }),
      }),
    },
    responses: {
      ...GENERIC_ERROR_RESPONSES,
      [http.Status.OK]: {
        description: 'Successfully updated the prompt',
        content: {
          [http.MediaTypes.JSON]: { schema: documentDataSchema },
        },
      },
    },
  })

const postRoute = updatePromptRouteFactory({
  path: ROUTES.api.v3.project.prompt,
  method: http.Methods.POST,
})

const putRoute = updatePromptRouteFactory({
  path: ROUTES.api.v3.project.prompt,
  method: http.Methods.PUT,
})

const patchRoute = updatePromptRouteFactory({
  path: ROUTES.api.v3.project.prompt,
  method: http.Methods.PATCH,
})

export type UpdatePromptRoute = typeof postRoute
export const updatePromptRoutes = [postRoute, putRoute, patchRoute] as const
