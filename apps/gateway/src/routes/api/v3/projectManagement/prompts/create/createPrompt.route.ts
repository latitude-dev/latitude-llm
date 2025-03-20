import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v2/documents/paramsSchema'
import { createRoute, RouteConfig } from '@hono/zod-openapi'
import {
  documentDataSchema,
  createDocumentDataSchema,
} from '@latitude-data/constants'

const createPromptRouteFactory = ({
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
        data: createDocumentDataSchema.openapi({
          description: 'New prompt values',
        }),
      }),
    },
    responses: {
      ...GENERIC_ERROR_RESPONSES,
      [http.Status.CREATED]: {
        description: 'Successfully created the prompt',
        content: {
          [http.MediaTypes.JSON]: { schema: documentDataSchema },
        },
      },
    },
  })

const postRoute = createPromptRouteFactory({
  path: ROUTES.api.v3.project.prompts,
  method: http.Methods.POST,
})

const putRoute = createPromptRouteFactory({
  path: ROUTES.api.v3.project.prompts,
  method: http.Methods.PUT,
})

export type CreatePromptRoute = typeof postRoute
export const createPromptRoutes = [postRoute, putRoute] as const
