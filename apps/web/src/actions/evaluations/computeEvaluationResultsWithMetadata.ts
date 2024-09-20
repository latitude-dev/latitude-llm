'use server'

import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { computeEvaluationResultsWithMetadata } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { z } from 'zod'

import { withProject } from '../procedures'

export const computeEvaluationResultsWithMetadataAction = withProject
  .createServerAction()
  .input(
    z.object({
      evaluationId: z.number(),
      documentUuid: z.string(),
      commitUuid: z.string(),
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

    return await computeEvaluationResultsWithMetadata({
      workspaceId: ctx.workspace.id,
      evaluation,
      documentUuid,
      draft: commit,
    }).then((r) => r.unwrap())
  })
