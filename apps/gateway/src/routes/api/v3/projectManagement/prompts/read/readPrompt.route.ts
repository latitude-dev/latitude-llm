import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v2/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'
import { documentDataSchema } from '@latitude-data/constants'

export const readPromptRoute = createRoute({
  operationId: 'readPrompt',
  method: http.Methods.GET,
  path: ROUTES.api.v3.project.prompt,
  tags: ['Project Management', 'Prompts', 'Read'],
  request: {
    params: documentParamsSchema.extend({
      documentUuid: z.string().openapi({
        description: 'Document UUID',
      }),
    }),
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'Successfully read a prompt',
      content: {
        [http.MediaTypes.JSON]: { schema: documentDataSchema },
      },
    },
  },
})

export type ReadPromptRoute = typeof readPromptRoute
