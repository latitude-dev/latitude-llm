import { UnauthorizedError } from '@latitude-data/core/lib/errors'
import {
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import * as Sentry from '@sentry/nextjs'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { z } from 'zod'
import { createServerActionProcedure } from 'zsa'

export const errorHandlingProcedure = createServerActionProcedure()
  .onError((error) => {
    Sentry.captureException(error)
  })
  .handler((ctx) => ({ ...ctx }))

export const authProcedure = createServerActionProcedure(
  errorHandlingProcedure,
).handler(async () => {
  try {
    const data = await getCurrentUser()

    return {
      session: data.session!,
      workspace: data.workspace,
      user: data.user,
    }
  } catch (error) {
    throw new UnauthorizedError((error as Error).message)
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

export const widthDocument = createServerActionProcedure(withProject)
  .input(z.object({ commitUuid: z.string(), documentUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const repo = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await repo
      .getDocumentAtCommit({
        projectId: ctx.project.id,
        commitUuid: input.commitUuid,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())

    return { ...ctx, document }
  })
