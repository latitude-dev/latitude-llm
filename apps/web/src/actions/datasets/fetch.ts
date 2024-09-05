'use server'

import { DatasetsRepository } from '@latitude-data/core/repositories'

import { authProcedure } from '../procedures'

export const getDatasetsAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const scope = new DatasetsRepository(ctx.workspace.id)
    return await scope.findAll().then((r) => r.unwrap())
  })
