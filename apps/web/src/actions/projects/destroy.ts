'use server'

import { ProjectsRepository } from '@latitude-data/core/repositories'
import { destroyProject } from '@latitude-data/core/services/projects/destroy'
import { ROUTES } from '$/services/routes'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyProjectAction = authProcedure
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const scope = new ProjectsRepository(ctx.workspace.id)
    const project = await scope
      .find(Number(parsedInput.id))
      .then((r) => r.unwrap())
    const result = await destroyProject({ project })

    revalidatePath(ROUTES.dashboard.root)

    return result.unwrap()
  })
