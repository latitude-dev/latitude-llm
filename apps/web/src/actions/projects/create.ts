'use server'

import { createProject } from '@latitude-data/core/services/projects/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createProjectAction = authProcedure
  .createServerAction()
  .input(z.object({ name: z.string() }))
  .handler(async ({ input, ctx }) => {
    const workspace = ctx.workspace
    const user = ctx.user
    const result = await createProject({ name: input.name, workspace, user })
    const { project } = result.unwrap()

    return project
  })
