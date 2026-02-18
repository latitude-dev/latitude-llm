import { z } from '@hono/zod-openapi'
import { DatasetRowSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const updateDatasetRowRouteConfig = defineRouteConfig({
  method: 'put',
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
