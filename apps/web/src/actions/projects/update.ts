'use server'

import { ProjectsRepository } from '@latitude-data/core/repositories'
import { updateProject } from '@latitude-data/core/services/projects/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateProjectAction = authProcedure
  .createServerAction()
  .input(z.object({ id: z.number(), name: z.string() }))
  .handler(async ({ input, ctx }) => {
    const workspace = ctx.workspace
    const scope = new ProjectsRepository(workspace.id)
    const project = await scope.find(input.id).then((r) => r.unwrap())
    const result = await updateProject(project, { name: input.name })

    return result.unwrap()
  })
