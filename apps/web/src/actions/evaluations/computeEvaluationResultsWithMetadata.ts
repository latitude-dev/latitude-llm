'use server'

import { paginateQuery } from '@latitude-data/core/lib/index'
import {
  CommitsRepository,
  EvaluationResultWithMetadata,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { computeEvaluationResultsWithMetadataQuery } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { z } from 'zod'

import { withProject } from '../procedures'

export const computeEvaluationResultsWithMetadataAction = withProject
  .createServerAction()
  .input(
    z.object({
      evaluationId: z.number(),
      documentUuid: z.string(),
      commitUuid: z.string(),
      page: z.string().nullable(),
      pageSize: z.string().nullable(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { documentUuid } = input
    const { workspace, project } = ctx
    const commitsScope = new CommitsRepository(workspace.id)
    const evaluationScope = new EvaluationsRepository(workspace.id)
    const evaluation = await evaluationScope
      .find(input.evaluationId)
      .then((r) => r.unwrap())
    const commit = await commitsScope
      .getCommitByUuid({ projectId: project.id, uuid: input.commitUuid })
      .then((r) => r.unwrap())
    const { rows } = await paginateQuery({
      searchParams: {
        page: input.page ?? undefined,
        pageSize: input.pageSize ?? undefined,
      },
      dynamicQuery: computeEvaluationResultsWithMetadataQuery({
        workspaceId: evaluation.workspaceId,
        evaluation,
        documentUuid,
        draft: commit,
      }).$dynamic(),
    })

    return rows as EvaluationResultWithMetadata[]
  })
