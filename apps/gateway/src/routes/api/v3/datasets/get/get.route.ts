import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const getDatasetRoute = createOpenAPIRoute({
  method: 'get',
  path: API_ROUTES.v3.datasets.get,
  tags: ['Datasets'],
  security: [{ bearerAuth: [] }],
  summary: 'Get a dataset by ID',
  description: 'Returns a single dataset by its ID',
  request: {
    params: z.object({
      datasetId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: DatasetSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
