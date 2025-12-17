import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, documentUuid } = params

      const commitsRepository = new CommitsRepository(workspace.id)
      const commit = await commitsRepository
        .getCommitByUuid({
          projectId: projectId,
          uuid: commitUuid,
        })
        .then((r) => r.unwrap())

      const documentsRepository = new DocumentVersionsRepository(workspace.id)
      const document = await documentsRepository
        .getDocumentAtCommit({
          projectId: projectId,
          commitUuid: commit.uuid,
          documentUuid: documentUuid,
        })
        .then((r) => r.unwrap())

      const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
      const evaluations = await evaluationsRepository
        .listAtCommitByDocument({
          projectId: projectId,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(evaluations, { status: 200 })
    },
  ),
)
