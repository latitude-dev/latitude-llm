import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetRowSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const getDatasetRowRoute = createOpenAPIRoute({
  method: 'get',
  path: API_ROUTES.v3.datasetRows.get,
  tags: ['Dataset Rows'],
  security: [{ bearerAuth: [] }],
  summary: 'Get a dataset row by ID',
  description: 'Returns a single dataset row by its ID',
  request: {
    params: z.object({
      rowId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: DatasetRowSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
