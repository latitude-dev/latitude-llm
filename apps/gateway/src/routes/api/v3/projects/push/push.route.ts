import { z } from '@hono/zod-openapi'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'

const pushParamsSchema = z.object({
  projectId: z.string().openapi({
    param: {
      name: 'projectId',
      in: 'path',
    },
    example: '1',
  }),
  versionUuid: z.string().openapi({
    param: {
      name: 'versionUuid',
      in: 'path',
    },
    example: 'version-uuid-here',
  }),
})

const pushBodySchema = z.object({
  changes: z
    .array(
      z.object({
        path: z.string().openapi({
          description: 'Document path',
          example: '/my-prompt',
        }),
        content: z.string().openapi({
          description: 'Document content',
          example: 'Hello, world!',
        }),
        status: z.enum(['added', 'modified', 'deleted', 'unchanged']).openapi({
          description: 'Change status',
          example: 'modified',
        }),
        contentHash: z.string().optional().openapi({
          description: 'Content hash for validation',
          example: 'sha256-hash-here',
        }),
      }),
    )
    .openapi({
      description: 'Array of document changes to push',
    }),
})

const pushResponseSchema = z.object({
  versionUuid: z.string().openapi({
    description: 'UUID of the version after push',
    example: 'version-uuid-here',
  }),
  documentsProcessed: z.number().openapi({
    description: 'Number of documents processed',
    example: 3,
  }),
})

export const pushRouteConfig = defineRouteConfig({
  method: 'post',
  tags: ['Projects'],
  summary: 'Push commit changes',
  description: 'Push document changes to a commit',
  request: {
    params: pushParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: pushBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: pushResponseSchema,
        },
      },
      description: 'Commit pushed successfully',
    },
    ...GENERIC_ERROR_RESPONSES,
  },
})
