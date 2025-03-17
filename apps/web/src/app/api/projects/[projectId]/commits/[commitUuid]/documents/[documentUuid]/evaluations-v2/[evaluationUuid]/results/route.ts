import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
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
          evaluationUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, documentUuid, evaluationUuid } = params

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
      const evaluation = await evaluationsRepository
        .getAtCommitByDocument({
          projectId: projectId,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          evaluationUuid: evaluationUuid,
        })
        .then((r) => r.unwrap())

      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
      const results = await resultsRepository
        .listByEvaluation({ evaluationUuid: evaluation.uuid })
        .then((r) => r.unwrap())

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
