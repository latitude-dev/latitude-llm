import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v2/documents/paramsSchema'
import { createRoute, RouteConfig, z } from '@hono/zod-openapi'

const deletePromptRouteFactory = ({
  path,
  method,
}: {
  path: string
  method: RouteConfig['method']
}) =>
  createRoute({
    operationId: 'createPrompt',
    method,
    path,
    tags: ['Project Management', 'Prompts', 'Create'],
    request: {
      params: documentParamsSchema.extend({
        documentUuid: z.string().openapi({
          description: 'Document UUID to delete',
        }),
      }),
    },
    responses: {
      ...GENERIC_ERROR_RESPONSES,
      [http.Status.NO_CONTENT]: {
        description: 'Successfully deleted the prompt',
      },
    },
  })

export const deletePromptRoute = deletePromptRouteFactory({
  path: ROUTES.api.v3.project.prompt,
  method: http.Methods.DELETE,
})

export type DeletePromptRoute = typeof deletePromptRoute
