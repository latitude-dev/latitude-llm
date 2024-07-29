import { ProjectsRepository, UnauthorizedError } from '@latitude-data/core'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { z } from 'zod'
import { createServerActionProcedure } from 'zsa'

/**
 * Procedures allow you to add additional context to a set of server actions,
 * such as the userId of the caller.
 * Docs: https://zsa.vercel.app/docs/procedures
 */
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
  .input(z.object({ projectId: z.number() }))
  .handler(async ({ input, ctx }) => {
    const { workspace } = ctx
    const projectScope = new ProjectsRepository(workspace.id)
    const project = (
      await projectScope.getProjectById(input.projectId)
    ).unwrap()

    return { ...ctx, project }
  })
