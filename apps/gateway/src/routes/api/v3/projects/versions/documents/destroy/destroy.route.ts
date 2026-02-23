import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'
import { z } from '@hono/zod-openapi'

export const destroyDocumentRouteConfig = defineRouteConfig({
  operationId: 'deleteDocument',
  method: http.Methods.DELETE,
  description:
    'Delete a prompt/document from a project version. This endpoint only works with draft (non-merged) commits.',
  tags: ['Documents'],
  request: {
    params: z.object({
      projectId: z.string(),
      versionUuid: z.string().optional(),
      documentPath: z.string(),
    }),
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'The document was deleted successfully',
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            documentUuid: z.string(),
            path: z.string(),
          }),
        },
      },
    },
  },
})

export type DestroyDocumentRoute = typeof destroyDocumentRouteConfig
