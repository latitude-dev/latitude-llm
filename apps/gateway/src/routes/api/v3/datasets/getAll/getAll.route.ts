import { z } from '@hono/zod-openapi'
import { DatasetSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const getAllDatasetsRouteConfig = defineRouteConfig({
  method: 'get',
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
