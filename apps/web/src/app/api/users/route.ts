import { UsersRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { WorkspacePermissions } from '@latitude-data/core/permissions/workspace'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const usersScope = new UsersRepository(workspace.id)
      const rows = await usersScope.findAll().then((r) => r.unwrap())

      return NextResponse.json(rows, { status: 200 })
    },
    WorkspacePermissions.ManageMembers,
  ),
)
