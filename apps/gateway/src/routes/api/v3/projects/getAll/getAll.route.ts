import { API_ROUTES } from '$/api.routes'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ProjectSchema } from '$/openApi/schemas/ai'
import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'

export const getAllRoute = createOpenAPIRoute({
  method: 'get',
  path: API_ROUTES.v3.projects.getAll,
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
