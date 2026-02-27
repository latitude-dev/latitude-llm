import { findAllMemberships } from '@latitude-data/core/queries/memberships/findAll'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

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
      const memberships = await findAllMemberships({
        workspaceId: workspace.id,
      })

      return NextResponse.json(memberships, { status: 200 })
    },
  ),
)
