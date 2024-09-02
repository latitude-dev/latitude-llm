'use server'

import { ProjectsRepository } from '@latitude-data/core/repositories'

import { authProcedure } from '../procedures'

export const fetchProjectsAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const scope = new ProjectsRepository(ctx.workspace.id)

    return await scope.findAllActive().then((r) => r.unwrap())
  })
