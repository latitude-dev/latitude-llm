import { z } from '@hono/zod-openapi'
import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { CommitSchema } from '../create/createCommit.route'
import { defineRouteConfig } from '$/routes/api/helpers'

export const publishCommitRouteConfig = defineRouteConfig({
  method: http.Methods.POST,
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  summary: 'Publish project version',
  description: 'Publishes a draft version (commit) for a project',
  request: {
    params: z.object({
      projectId: z.string(),
      versionUuid: z.string(),
    }),
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
          }),
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

export type PublishCommitRoute = typeof publishCommitRouteConfig
