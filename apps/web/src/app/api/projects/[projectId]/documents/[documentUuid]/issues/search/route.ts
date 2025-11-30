import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  ProjectsRepository,
  IssuesRepository,
  DocumentVersionsRepository,
  CommitsRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { IssueGroup, IssueStatuses } from '@latitude-data/constants/issues'

export type SearchIssueResponse = Awaited<
  ReturnType<IssuesRepository['findByTitleAndStatuses']>
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
          documentUuid: string
          statuses: string | undefined
          group: string | undefined
          commitUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const query = request.nextUrl.searchParams
      const { projectId, documentUuid } = paramsSchema.parse({
        projectId: params.projectId,
        documentUuid: params.documentUuid,
      })
      const commitUuid = query.get('commitUuid')
      const title = query.get('query')
      const statusesParam = query.get('statuses')
      const groupParam = query.get('group')
      const projectsRepo = new ProjectsRepository(workspace.id)
      const project = await projectsRepo.find(projectId).then((r) => r.unwrap())
      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo
        .getCommitByUuid({ uuid: commitUuid! })
        .then((r) => r.unwrap())
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const document = await docsScope
        .getSomeDocumentByUuid({
          documentUuid,
          projectId,
        })
        .then((r) => r.unwrap())
      const issuesRepo = new IssuesRepository(workspace.id)

      const result = await issuesRepo.findByTitleAndStatuses({
        project,
        document,
        commit,
        title,
        statuses:
          statusesParam && statusesParam.length > 0
            ? (statusesParam.split(',') as IssueStatuses[])
            : undefined,
        group:
          groupParam && groupParam.length > 0
            ? (groupParam as IssueGroup)
            : undefined,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
