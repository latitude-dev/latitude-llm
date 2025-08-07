import { API_ROUTES } from '$/api.routes'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ProjectSchema } from '$/openApi/schemas/ai'
import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'

export const createRoute = createOpenAPIRoute({
  method: 'post',
  path: API_ROUTES.v3.projects.create,
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  summary: 'Create a new project',
  description: 'Creates a new project in the authenticated workspace',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Project created successfully',
      content: {
        'application/json': {
          schema: ProjectSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
