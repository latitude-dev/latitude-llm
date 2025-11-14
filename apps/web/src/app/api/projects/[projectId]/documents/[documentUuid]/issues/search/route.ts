import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  ProjectsRepository,
  IssuesRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export type SearchIssueResponse = Awaited<
  ReturnType<IssuesRepository['findByTitle']>
>

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  documentUuid: z.string(),
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
      const query = request.nextUrl.searchParams
      const { projectId, documentUuid } = paramsSchema.parse({
        projectId: params.projectId,
        documentUuid: query.get('documentUuid'),
      })
      const title = query.get('query')
      const projectsRepo = new ProjectsRepository(workspace.id)
      const project = await projectsRepo.find(projectId).then((r) => r.unwrap())
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const document = await docsScope
        .getSomeDocumentByUuid({
          documentUuid,
          projectId,
        })
        .then((r) => r.unwrap())
      const issuesRepo = new IssuesRepository(workspace.id)
      const result = await issuesRepo.findByTitle({
        project,
        document,
        title,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
