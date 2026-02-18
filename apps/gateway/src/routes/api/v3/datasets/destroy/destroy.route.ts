import { z } from '@hono/zod-openapi'
import { DatasetSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const destroyDatasetRouteConfig = defineRouteConfig({
  method: 'delete',
  tags: ['Datasets'],
  security: [{ bearerAuth: [] }],
  summary: 'Delete a dataset',
  description: 'Soft deletes a dataset',
  request: {
    params: z.object({
      datasetId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Dataset deleted successfully',
      content: {
        'application/json': {
          schema: DatasetSchema.omit({ author: true }),
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
