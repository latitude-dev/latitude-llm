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
  commitUuid: z.string(),
  issueId: z.coerce.number(),
})

export const GET = errorHandler(
  authHandler(
    async (
      _r: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: string
          commitUuid: string
          issueId: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, issueId } = paramsSchema.parse({
        projectId: params.projectId,
        commitUuid: params.commitUuid,
        issueId: params.issueId,
      })
      const projectsRepo = new ProjectsRepository(workspace.id)
      const project = await projectsRepo.find(projectId).then((r) => r.unwrap())
      const issuesRepo = new IssuesRepository(workspace.id)
      const issue = await issuesRepo.findById({
        project,
        issueId,
      })

      if (!issue) {
        return NextResponse.json(
          { message: 'Issue not found' },
          { status: 404 },
        )
      }

      return NextResponse.json(issue, { status: 200 })
    },
  ),
)
