import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

export const VersionSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  projectId: z.number(),
  version: z.number().nullable(),
  userId: z.string(),
  mergedAt: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.string().nullable(),
})

export const getAllVersionsRoute = createOpenAPIRoute({
  method: http.Methods.GET,
  path: API_ROUTES.v3.projects.versions.getAll,
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  summary: 'Get all project versions',
  description: 'Returns all versions (commits) for a project',
  request: {
    params: z.object({
      projectId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.array(VersionSchema),
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
