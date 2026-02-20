import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
} from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

import { evaluationResultsV2SearchFromQueryParams } from '@latitude-data/core/helpers'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { resolveCommitFilterFromUrl } from '../../resolveCommitFilterFromUrl'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
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
      const { projectId, commitUuid, evaluationUuid } = params
      const search = evaluationResultsV2SearchFromQueryParams(
        Object.fromEntries(request.nextUrl.searchParams.entries()),
      )

      const commitsRepository = new CommitsRepository(workspace.id)
      const commit = await commitsRepository
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())

      const resolvedSearch = await resolveCommitFilterFromUrl({
        commitsRepository,
        commit,
        search,
      })

      const repository = new EvaluationResultsV2Repository(workspace.id)
      const count = await repository
        .countListByEvaluation({
          projectId: Number(projectId),
          evaluationUuid,
          params: resolvedSearch,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(count, { status: 200 })
    },
  ),
)
