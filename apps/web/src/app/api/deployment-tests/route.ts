'use server'

import { NextRequest, NextResponse } from 'next/server'
import { errorHandler } from '$/middlewares/errorHandler'
import { authHandler } from '$/middlewares/authHandler'
import { DeploymentTestsRepository } from '@latitude-data/core/repositories/deploymentTestsRepository'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { BadRequestError } from '@latitude-data/core/lib/errors'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const projectIdParam = searchParams.get('projectId')
      const commitIdParam = searchParams.get('commitId')
      const statusParams = searchParams.getAll('status')

      if (!projectIdParam) {
        throw new BadRequestError('projectId query parameter is required')
      }

      const projectId = Number(projectIdParam)
      if (isNaN(projectId)) {
        throw new BadRequestError('Invalid project ID')
      }

      let commitId: number | undefined
      if (commitIdParam) {
        commitId = Number(commitIdParam)
        if (isNaN(commitId)) {
          throw new BadRequestError('Invalid commit ID')
        }
      }

      const repo = new DeploymentTestsRepository(workspace.id)
      const result = await repo.filterByProjectAndCommitAndStatus(
        projectId,
        commitId,
        statusParams.length > 0 ? statusParams : undefined,
      )

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
