'use server'

import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'

import { authProcedure } from '../procedures'

export const getApiKeysAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const apiKeysScope = new ApiKeysRepository(ctx.workspace.id)
    return apiKeysScope.findAll().then((r) => r.unwrap())
  })
