import { Project } from '@latitude-data/core/browser'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler<{}, Project[]>(
  authHandler<{}, Project[]>(
    async (_: NextRequest, _res: NextResponse, { workspace }) => {
      const scope = new ProjectsRepository(workspace.id)
      const projects = await scope.findAllActive().then((r) => r.unwrap())

      return NextResponse.json(projects, { status: 200 })
    },
  ),
)
