import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { documentPresenterSchema } from '$/presenters/documentPresenter'
import { defineRouteConfig } from '$/routes/api/helpers'
import { z } from '@hono/zod-openapi'

export const createOrUpdateDocumentRouteConfig = defineRouteConfig({
  operationId: 'createOrUpdateDocument',
  method: http.Methods.POST,
  description:
    'Create or update a prompt. By default, this endpoint only works with draft commits. Use force=true to allow modifications to the live commit.',
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

export type CreateOrUpdateDocumentRoute =
  typeof createOrUpdateDocumentRouteConfig
