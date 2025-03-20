import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v2/documents/paramsSchema'
import { createRoute } from '@hono/zod-openapi'
import { documentListSchema } from '@latitude-data/constants'

export const listPromptsRoute = createRoute({
  operationId: 'listPrompts',
  method: http.Methods.GET,
  path: ROUTES.api.v3.project.prompts,
  tags: ['Project Management', 'Prompts', 'List'],
  request: {
    params: documentParamsSchema,
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'Successful list of prompts',
      content: {
        [http.MediaTypes.JSON]: { schema: documentListSchema },
      },
    },
  },
})

export type ListPromptsRoute = typeof listPromptsRoute
