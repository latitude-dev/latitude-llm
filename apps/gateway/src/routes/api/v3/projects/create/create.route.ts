import { z } from '@hono/zod-openapi'
import { ProjectSchema } from '$/openApi/schemas/ai'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const createRouteConfig = defineRouteConfig({
  method: 'post',
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
