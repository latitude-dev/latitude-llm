import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  ProjectsRepository,
  IssuesRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

const paramsSchema = z.object({
  projectId: z.coerce.number(),
})

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId } = paramsSchema.parse({
        projectId: params.projectId,
      })
      const query = request.nextUrl.searchParams
      const title = query.get('title')
      const projectsRepo = new ProjectsRepository(workspace.id)
      const project = await projectsRepo.find(projectId).then((r) => r.unwrap())
      const issuesRepo = new IssuesRepository(workspace.id)
      const result = await issuesRepo.findByTitle({
        project,
        title,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
