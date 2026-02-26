'use server'

import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { updateProject } from '@latitude-data/core/services/projects/update'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateProjectAction = authProcedure
  .inputSchema(
    z.object({ id: z.number().or(z.string()), name: z.string().max(256) }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const workspace = ctx.workspace
    const project = await findProjectById({
      workspaceId: workspace.id,
      id: Number(parsedInput.id),
    })
    if (!project) throw new NotFoundError('Project not found')
    const result = await updateProject(project, { name: parsedInput.name })

    revalidatePath('/dashboard')

    return result.unwrap()
  })
