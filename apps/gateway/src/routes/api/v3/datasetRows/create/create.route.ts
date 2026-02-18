import { z } from '@hono/zod-openapi'
import { DatasetRowSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const createDatasetRowRouteConfig = defineRouteConfig({
  method: 'post',
  tags: ['Dataset Rows'],
  security: [{ bearerAuth: [] }],
  summary: 'Create a new dataset row',
  description: 'Creates a new row in a dataset',
  request: {
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
    201: {
      description: 'Dataset row created successfully',
      content: {
        'application/json': {
          schema: DatasetRowSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
