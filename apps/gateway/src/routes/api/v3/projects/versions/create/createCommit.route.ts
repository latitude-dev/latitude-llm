import { z } from '@hono/zod-openapi'
import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

export const CommitSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  projectId: z.number(),
  message: z.string(),
  authorName: z.string().nullable(),
  authorEmail: z.string().nullable(),
  authorId: z.number().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  status: z.string(),
  parentCommitUuid: z.string().nullable(),
})

export const createVersionRouteConfig = defineRouteConfig({
  method: http.Methods.POST,
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

export type CreateCommitRoute = typeof createVersionRouteConfig
