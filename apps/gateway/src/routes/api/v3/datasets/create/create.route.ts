import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetSchema, DatasetColumnSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const createDatasetRoute = createOpenAPIRoute({
  method: 'post',
  path: API_ROUTES.v3.datasets.create,
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
