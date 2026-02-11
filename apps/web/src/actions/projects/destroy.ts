'use server'

import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { destroyProject } from '@latitude-data/core/services/projects/destroy'
import { ROUTES } from '$/services/routes'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyProjectAction = authProcedure
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const project = await findProjectById({ workspaceId: ctx.workspace.id, id: Number(parsedInput.id) })
      .then((r) => r.unwrap())
    const result = await destroyProject({ project })

    revalidatePath(ROUTES.dashboard.root)

    return result.unwrap()
  })
