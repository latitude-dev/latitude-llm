import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import { DatasetSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const getAllDatasetsRoute = createOpenAPIRoute({
  method: 'get',
  path: API_ROUTES.v3.datasets.getAll,
  tags: ['Datasets'],
  security: [{ bearerAuth: [] }],
  summary: 'Get all datasets for a workspace',
  description:
    'Returns all datasets for the authenticated workspace with pagination',
  request: {
    query: z.object({
      page: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.array(DatasetSchema),
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
