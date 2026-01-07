'use server'

import { OptimizationConfigurationSchema } from '@latitude-data/core/constants'
import {
  DatasetsRepository,
  EvaluationsV2Repository,
  OptimizationsRepository,
} from '@latitude-data/core/repositories'
import { startOptimization } from '@latitude-data/core/services/optimizations/start'
import { z } from 'zod'
import { withDocument, withDocumentSchema } from '../procedures'

export const startOptimizationAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      evaluationUuid: z.string(),
      datasetId: z.number().optional(),
      configuration: OptimizationConfigurationSchema,
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const datasetsRepository = new DatasetsRepository(ctx.workspace.id)
    let dataset
    if (parsedInput.datasetId) {
      dataset = await datasetsRepository
        .find(parsedInput.datasetId)
        .then((r) => r.unwrap())
    }

    const evaluationsRepository = new EvaluationsV2Repository(ctx.workspace.id)
    const evaluation = await evaluationsRepository
      .getAtCommitByDocument({
        projectId: ctx.project.id,
        commitUuid: ctx.commit.uuid,
        documentUuid: ctx.document.documentUuid,
        evaluationUuid: parsedInput.evaluationUuid,
      })
      .then((r) => r.unwrap())

    const result = await startOptimization({
      evaluation: evaluation,
      dataset: dataset,
      configuration: parsedInput.configuration,
      document: ctx.document,
      baselineCommit: ctx.commit,
      project: ctx.project,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    const optimizationsRepository = new OptimizationsRepository(
      ctx.workspace.id,
    )
    const optimization = await optimizationsRepository
      .findWithDetails(result.optimization.id)
      .then((r) => r.unwrap())

    return { optimization }
  })
