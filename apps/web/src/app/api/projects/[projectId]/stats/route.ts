import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { computeProjectStats } from '@latitude-data/core/services/projects/computeProjectStats'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const paramsSchema = z.object({
  projectId: z.coerce.number(),
})

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
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

      const projectsScope = new ProjectsRepository(workspace.id)
      const project = await projectsScope
        .find(projectId)
        .then((r) => r.unwrap())

      const result = await computeProjectStats({
        workspaceId: project.workspaceId,
        projectId: project.id,
      }).then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
