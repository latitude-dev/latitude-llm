import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { annotatedResultStatsByProject } from '@latitude-data/core/data-access/issues/annotatedResultStatsByProject'

const paramsSchema = z.object({
  projectId: z.coerce.number(),
})

export type IssuesOverviewResponse = Awaited<
  ReturnType<typeof annotatedResultStatsByProject>
>

export const GET = errorHandler(
  authHandler(
    async (
      _request: NextRequest,
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
      const projectsRepo = new ProjectsRepository(workspace.id)
      const project = await projectsRepo.find(projectId).then((r) => r.unwrap())
      const stats = await annotatedResultStatsByProject({ project })

      return NextResponse.json(stats, { status: 200 })
    },
  ),
)
