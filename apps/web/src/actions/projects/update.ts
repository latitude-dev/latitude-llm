'use server'

import { ProjectsRepository } from '@latitude-data/core/repositories'
import { updateProject } from '@latitude-data/core/services/projects/update'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateProjectAction = authProcedure
  .inputSchema(z.object({ id: z.number().or(z.string()), name: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const workspace = ctx.workspace
    const scope = new ProjectsRepository(workspace.id)
    const project = await scope.find(parsedInput.id).then((r) => r.unwrap())
    const result = await updateProject(project, { name: parsedInput.name })

    revalidatePath('/dashboard')

    return result.unwrap()
  })
