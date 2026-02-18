import { z } from '@hono/zod-openapi'
import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

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

export const getAllVersionsRouteConfig = defineRouteConfig({
  method: http.Methods.GET,
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
