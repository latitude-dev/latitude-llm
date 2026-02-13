import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
} from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

import { evaluationResultsV2SearchFromQueryParams } from '@latitude-data/core/helpers'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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

      if (search.filters?.commitIds === undefined) {
        const commitsRepository = new CommitsRepository(workspace.id)
        const commit = await commitsRepository
          .getCommitByUuid({ projectId, uuid: commitUuid })
          .then((r) => r.unwrap())

        search.filters = {
          ...search.filters,
          commitIds: [commit.id],
        }
      }

      const repository = new EvaluationResultsV2Repository(workspace.id)
      const count = await repository
        .countListByEvaluation({ evaluationUuid, params: search })
        .then((r) => r.unwrap())

      return NextResponse.json(count, { status: 200 })
    },
  ),
)
