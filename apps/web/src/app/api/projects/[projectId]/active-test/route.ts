'use server'

import { NextRequest, NextResponse } from 'next/server'
import { errorHandler } from '$/middlewares/errorHandler'
import { authHandler } from '$/middlewares/authHandler'
import { DeploymentTestsRepository } from '@latitude-data/core/repositories/deploymentTestsRepository'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

export const GET = errorHandler(
  authHandler(
    async (req: NextRequest, { workspace }: { workspace: Workspace }) => {
      const projectId = req.nextUrl.searchParams.get('projectId')
      const commitId = req.nextUrl.searchParams.get('commitId')

      if (!projectId || !commitId) {
        return NextResponse.json(
          { error: 'Missing projectId or commitId' },
          { status: 400 },
        )
      }

      const repo = new DeploymentTestsRepository(workspace.id)
      const activeTest = await repo.findActiveForCommit(
        Number(projectId),
        Number(commitId),
      )

      return NextResponse.json(activeTest, { status: 200 })
    },
  ),
)
