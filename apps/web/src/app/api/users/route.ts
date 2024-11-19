import { UsersRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { User } from 'lucia'
import { NextRequest, NextResponse } from 'next/server'

type IParams = {}
export const GET = errorHandler<IParams, User[]>(
  authHandler<IParams, User[]>(async (_: NextRequest, { workspace }) => {
    const usersScope = new UsersRepository(workspace.id)
    const rows = await usersScope.findAll().then((r) => r.unwrap())

    return NextResponse.json(rows, { status: 200 })
  }),
)
