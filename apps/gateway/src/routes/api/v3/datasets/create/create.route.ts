import { z } from '@hono/zod-openapi'
import { DatasetSchema, DatasetColumnSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const createDatasetRouteConfig = defineRouteConfig({
  method: 'post',
  tags: ['Datasets'],
  security: [{ bearerAuth: [] }],
  summary: 'Create a new dataset',
  description: 'Creates a new dataset in the workspace',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            columns: z.array(DatasetColumnSchema),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Dataset created successfully',
      content: {
        'application/json': {
          schema: DatasetSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
