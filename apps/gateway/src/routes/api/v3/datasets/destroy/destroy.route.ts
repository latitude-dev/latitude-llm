import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const destroyDatasetRoute = createOpenAPIRoute({
  method: 'delete',
  path: API_ROUTES.v3.datasets.destroy,
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
