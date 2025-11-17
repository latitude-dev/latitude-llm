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
import { IssueGroup, IssueStatuses } from '@latitude-data/constants/issues'

export type SearchIssueResponse = Awaited<
  ReturnType<IssuesRepository['findByTitleAndStatuses']>
>

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  documentUuid: z.string(),
  statuses: z.string().optional(),
  group: z.string().optional(),
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
        }
        workspace: Workspace
      },
    ) => {
      const query = request.nextUrl.searchParams
      const { projectId, documentUuid, statuses, group } = paramsSchema.parse({
        projectId: params.projectId,
        documentUuid: params.documentUuid,
        statuses: params.statuses,
        group: params.group,
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
      const result = await issuesRepo.findByTitleAndStatuses({
        project,
        document,
        title,
        statuses: statuses?.split(',') as IssueStatuses[],
        group: group as IssueGroup,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
