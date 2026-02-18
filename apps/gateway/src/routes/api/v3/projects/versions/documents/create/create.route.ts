import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { defineRouteConfig } from '$/routes/api/helpers'
import { z } from '@hono/zod-openapi'

export const createDocumentRouteConfig = defineRouteConfig({
  operationId: 'createDocument',
  method: http.Methods.POST,
  description: 'Create a prompt',
  tags: ['Documents'],
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

export type CreateDocumentRoute = typeof createDocumentRouteConfig
