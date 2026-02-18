import { z } from '@hono/zod-openapi'
import { DatasetRowSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const destroyDatasetRowRouteConfig = defineRouteConfig({
  method: 'delete',
  tags: ['Dataset Rows'],
  security: [{ bearerAuth: [] }],
  summary: 'Delete a dataset row',
  description: 'Deletes a dataset row',
  request: {
    params: z.object({
      rowId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Dataset row deleted successfully',
      content: {
        'application/json': {
          schema: DatasetRowSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
