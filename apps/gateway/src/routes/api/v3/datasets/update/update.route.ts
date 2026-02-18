import { z } from '@hono/zod-openapi'
import { DatasetSchema, DatasetColumnSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const updateDatasetRouteConfig = defineRouteConfig({
  method: 'put',
  tags: ['Datasets'],
  security: [{ bearerAuth: [] }],
  summary: 'Update a dataset',
  description: 'Updates a dataset columns',
  request: {
    params: z.object({
      datasetId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            columns: z.array(DatasetColumnSchema),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Dataset updated successfully',
      content: {
        'application/json': {
          schema: DatasetSchema.omit({ author: true }),
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
