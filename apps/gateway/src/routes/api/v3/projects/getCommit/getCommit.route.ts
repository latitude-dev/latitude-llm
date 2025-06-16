import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

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

export const getCommitRoute = createOpenAPIRoute({
  method: http.Methods.GET,
  path: API_ROUTES.v3.projects.getCommit,
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  summary: 'Get project commit',
  description: 'Returns a specific commit for a project by its UUID',
  request: {
    params: z.object({
      projectId: z.string(),
      commitUuid: z.string(),
    }),
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
