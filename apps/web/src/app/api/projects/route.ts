import type { Workspace } from '@latitude-data/core/browser'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'

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
      const scope = new ProjectsRepository(workspace.id)
      const projects = await scope.findAllActive().then((r) => r.unwrap())

      return NextResponse.json(projects, { status: 200 })
    },
  ),
)
