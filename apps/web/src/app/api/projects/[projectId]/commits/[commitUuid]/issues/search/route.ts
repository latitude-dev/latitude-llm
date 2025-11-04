import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  ProjectsRepository,
  IssuesRepository,
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export type SearchIssueResponse = Awaited<
  ReturnType<IssuesRepository['findByTitle']>
>

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
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
          commitUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const query = request.nextUrl.searchParams
      const { projectId, commitUuid, documentUuid } = paramsSchema.parse({
        projectId: params.projectId,
        commitUuid: params.commitUuid,
        documentUuid: query.get('documentUuid'),
      })
      const title = query.get('query')
      const projectsRepo = new ProjectsRepository(workspace.id)
      const project = await projectsRepo.find(projectId).then((r) => r.unwrap())
      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo
        .getCommitByUuid({
          projectId,
          uuid: commitUuid,
        })
        .then((r) => r.unwrap())
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const document = await docsScope
        .getDocumentByUuid({
          documentUuid,
          commitUuid: commit?.uuid ?? undefined,
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
