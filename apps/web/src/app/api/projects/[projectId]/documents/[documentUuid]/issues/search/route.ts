import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  DocumentVersionsRepository,
  CommitsRepository,
} from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { findIssuesByTitleAndStatuses } from '@latitude-data/core/queries/issues/findByTitleAndStatuses'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { IssueGroup } from '@latitude-data/constants/issues'

export type SearchIssueResponse = Awaited<
  ReturnType<typeof findIssuesByTitleAndStatuses>
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
          commitUuid: string
          group: string | undefined
        }
        workspace: Workspace
      },
    ) => {
      const query = request.nextUrl.searchParams

      const { projectId, documentUuid } = paramsSchema.parse({
        projectId: params.projectId,
        documentUuid: params.documentUuid,
      })
      const title = query.get('query')
      const commitUuid = query.get('commitUuid')
      const groupParam = query.get('group')
      const project = await findProjectById({
        workspaceId: workspace.id,
        id: projectId,
      })
      if (!project) throw new NotFoundError('Project not found')
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
      const result = await findIssuesByTitleAndStatuses({
        workspaceId: workspace.id,
        project,
        commit,
        document,
        title,
        group:
          groupParam && groupParam.length > 0
            ? (groupParam as IssueGroup)
            : undefined,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
