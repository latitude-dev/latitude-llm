'use server'

import { createProject } from '@latitude-data/core/services/projects/create'
import { ROUTES } from '$/services/routes'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createProjectAction = authProcedure
  .inputSchema(z.object({ name: z.string().max(256) }))
  .action(async ({ parsedInput, ctx }) => {
    const workspace = ctx.workspace
    const user = ctx.user
    const result = await createProject({
      name: parsedInput.name,
      workspace,
      user,
    })
    const { project } = result.unwrap()

    revalidatePath(ROUTES.dashboard.root)

    return project
  })
