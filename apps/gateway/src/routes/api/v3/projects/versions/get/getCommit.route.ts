import { z } from '@hono/zod-openapi'
import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const VersionSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  projectId: z.number(),
  message: z.string(),
  authorName: z.string().nullable(),
  aucommitUuidthorEmail: z.string().nullable(),
  authorId: z.number().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  status: z.string(),
  parentCommitUuid: z.string().nullable(),
})

export const getVersionRouteConfig = defineRouteConfig({
  method: http.Methods.GET,
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
