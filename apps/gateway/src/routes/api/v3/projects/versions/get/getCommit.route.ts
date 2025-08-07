import { createRoute as createOpenAPIRoute, z } from '@hono/zod-openapi'
import { API_ROUTES } from '$/api.routes'
import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'

const VersionSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  projectId: z.number(),
  message: z.string(),
  authorName: z.string().nullable(),
  aucommitUuidthorEmail: z.string().nullable(),
  authorId: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.string(),
  parentCommitUuid: z.string().nullable(),
})

export const getVersionRoute = createOpenAPIRoute({
  method: http.Methods.GET,
  path: API_ROUTES.v3.projects.versions.get,
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  summary: 'Get project version',
  description: 'Returns a specific version for a project by its UUID',
  request: {
    params: z.object({
      versionUuid: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: VersionSchema,
        },
      },
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
