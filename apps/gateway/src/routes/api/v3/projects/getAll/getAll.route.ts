import { z } from '@hono/zod-openapi'
import { ProjectSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const getAllRouteConfig = defineRouteConfig({
  method: 'get',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  summary: 'Get all projects for a workspace',
  description: 'Returns all active projects for the authenticated workspace',
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.array(ProjectSchema),
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
