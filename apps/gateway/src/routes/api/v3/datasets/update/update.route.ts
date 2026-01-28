import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetSchema, DatasetColumnSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const updateDatasetRoute = createOpenAPIRoute({
  method: 'put',
  path: API_ROUTES.v3.datasets.update,
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
