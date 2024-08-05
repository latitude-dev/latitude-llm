import { ProjectsRepository, UnauthorizedError } from '@latitude-data/core'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { z } from 'zod'
import { createServerActionProcedure } from 'zsa'

export const authProcedure = createServerActionProcedure().handler(async () => {
  try {
    const data = await getCurrentUser()

    return {
      session: data.session!,
      workspace: data.workspace,
      user: data.user,
    }
  } catch (err) {
    throw new UnauthorizedError((err as Error).message)
  }
})

export const withProject = createServerActionProcedure(authProcedure)
  .input(z.object({ projectId: z.number().or(z.string()) }))
  .handler(async ({ input, ctx }) => {
    const { workspace } = ctx
    const projectScope = new ProjectsRepository(workspace.id)
    const project = (
      await projectScope.getProjectById(Number(input.projectId))
    ).unwrap()

    return { ...ctx, project }
  })
