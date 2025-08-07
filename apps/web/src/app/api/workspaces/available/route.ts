import { unsafelyFindWorkspacesFromUser } from '@latitude-data/core/data-access'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        user,
      }: {
        user: { id: string; email: string }
      },
    ) => {
      const availableWorkspaces = await unsafelyFindWorkspacesFromUser(user.id)
      return NextResponse.json(availableWorkspaces, { status: 200 })
    },
  ),
)
