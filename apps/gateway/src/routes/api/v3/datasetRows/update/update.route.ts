import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetRowSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const updateDatasetRowRoute = createOpenAPIRoute({
  method: 'put',
  path: API_ROUTES.v3.datasetRows.update,
  tags: ['Dataset Rows'],
  security: [{ bearerAuth: [] }],
  summary: 'Update a dataset row',
  description: 'Updates a dataset row data',
  request: {
    params: z.object({
      rowId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            datasetId: z.number(),
            rowData: z.record(z.string(), z.any()).openapi({
              type: 'object',
              additionalProperties: true,
              description: 'Row data as key-value pairs',
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Dataset row updated successfully',
      content: {
        'application/json': {
          schema: DatasetRowSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
