'use server'

import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { createAnnotationQueue } from '@latitude-data/core/services/annotationQueues/create'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { NotFoundError } from '@latitude-data/constants/errors'

export const createAnnotationQueueAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      projectId: z.number(),
      name: z.string().min(1, { error: 'Name is required' }),
      description: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const project = await findProjectById({
      workspaceId: parsedInput.workspaceId,
      id: parsedInput.projectId,
    })

    if (!project) {
      throw new NotFoundError(
        `Project with id ${parsedInput.projectId} not found in workspace ${parsedInput.workspaceId}`,
      )
    }

    return createAnnotationQueue({
      project,
      name: parsedInput.name,
      description: parsedInput.description,
    }).then((r) => r.unwrap())
  })
