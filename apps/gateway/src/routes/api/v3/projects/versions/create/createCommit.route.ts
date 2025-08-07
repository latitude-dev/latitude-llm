import { API_ROUTES } from '$/api.routes'
import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'

export const CommitSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  projectId: z.number(),
  message: z.string(),
  authorName: z.string().nullable(),
  authorEmail: z.string().nullable(),
  authorId: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.string(),
  parentCommitUuid: z.string().nullable(),
})

export const createVersionRoute = createOpenAPIRoute({
  method: http.Methods.POST,
  path: API_ROUTES.v3.projects.versions.create,
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  summary: 'Create project version',
  description: 'Creates a new version for a project',
  request: {
    params: z.object({
      projectId: z.string(),
    }),
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({ name: z.string() }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: CommitSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})

export type CreateCommitRoute = typeof createVersionRoute
