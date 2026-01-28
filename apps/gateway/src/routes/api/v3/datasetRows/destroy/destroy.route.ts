import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetRowSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const destroyDatasetRowRoute = createOpenAPIRoute({
  method: 'delete',
  path: API_ROUTES.v3.datasetRows.destroy,
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
