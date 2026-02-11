import { findAllActiveProjects } from '@latitude-data/core/queries/projects/findAllActive'
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
      const projects = await findAllActiveProjects({
        workspaceId: workspace.id,
      })

      return NextResponse.json(projects, { status: 200 })
    },
  ),
)
