import { createRoute, z } from '@hono/zod-openapi'

import { API_ROUTES } from '$/api.routes'

const pushCommitParamsSchema = z.object({
  projectId: z.string().openapi({
    param: {
      name: 'projectId',
      in: 'path',
    },
    example: '1',
  }),
  commitUuid: z.string().openapi({
    param: {
      name: 'commitUuid', 
      in: 'path',
    },
    example: 'commit-uuid-here',
  }),
})

const pushCommitBodySchema = z.object({
  changes: z.array(
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
    })
  ).openapi({
    description: 'Array of document changes to push',
  }),
})

const pushCommitResponseSchema = z.object({
  commitUuid: z.string().openapi({
    description: 'UUID of the commit after push',
    example: 'commit-uuid-here',
  }),
  documentsProcessed: z.number().openapi({
    description: 'Number of documents processed',
    example: 3,
  }),
})

export const pushCommitRoute = createRoute({
  path: API_ROUTES.v3.projects.pushCommit,
  method: 'post',
  tags: ['Projects'],
  summary: 'Push commit changes',
  description: 'Push document changes to a commit',
  request: {
    params: pushCommitParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: pushCommitBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: pushCommitResponseSchema,
        },
      },
      description: 'Commit pushed successfully',
    },
    400: {
      description: 'Bad request',
    },
    404: {
      description: 'Project or commit not found',
    },
    422: {
      description: 'Validation errors in documents',
    },
  },
})