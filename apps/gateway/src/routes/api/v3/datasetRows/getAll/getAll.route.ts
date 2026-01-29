import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetRowSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const getAllDatasetRowsRoute = createOpenAPIRoute({
  method: 'get',
  path: API_ROUTES.v3.datasetRows.getAll,
  tags: ['Dataset Rows'],
  security: [{ bearerAuth: [] }],
  summary: 'Get all rows for a dataset',
  description: 'Returns all rows for a specific dataset with pagination',
  request: {
    query: z.object({
      datasetId: z.string(),
      page: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.array(DatasetRowSchema),
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
