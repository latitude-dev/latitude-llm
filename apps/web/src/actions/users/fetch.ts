'use server'

import { UsersRepository } from '@latitude-data/core'
import userPresenter from '$/presenters/userPresenter'

import { authProcedure } from '../procedures'

export const getUsersActions = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const usersScope = new UsersRepository(ctx.workspace.id)

    return await usersScope
      .findAll()
      .then((r) => r.unwrap())
      .then((r) => r.map(userPresenter))
  })
