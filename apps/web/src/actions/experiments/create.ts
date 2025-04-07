'use server'

import { withDocument } from '../procedures'
import { createExperiment } from '@latitude-data/core/services/experiments/create'
import { startExperiment } from '@latitude-data/core/services/experiments/start/index'
import {
  DatasetsRepository,
  EvaluationsV2Repository,
  ExperimentsRepository,
} from '@latitude-data/core/repositories'

export const createExperimentAction = withDocument
  .createServerAction()
  // TODO: Add config
  // .input
  // z.object({
  //   settings: EvaluationSettingsSchema,
  //   options: EvaluationOptionsSchema.partial().optional(),
  // }),
  .handler(async ({ ctx, input }) => {
    const experimentsScope = new ExperimentsRepository(ctx.workspace.id)
    const docExperimentsCount = await experimentsScope.countByDocumentUuid(
      ctx.document.documentUuid,
    )
    const name = `Experiment #${docExperimentsCount + 1}`

    const datasetsScope = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetsScope.find(2).then((r) => r.unwrap())

    const evaluationsScope = new EvaluationsV2Repository(ctx.workspace.id)
    const evaluations = await evaluationsScope
      .listAtCommitByDocument({
        projectId: ctx.commit.projectId,
        commitUuid: '22c8e0ea-e9e6-4464-b06e-9edee4224876',
        documentUuid: ctx.document.documentUuid,
      })
      .then((r) => r.unwrap())

    const experiment = await createExperiment({
      name,
      document: ctx.document,
      commit: ctx.commit,
      evaluations,
      dataset,
      parametersMap: {
        a: 0,
        b: 1,
      },
      expectedOutputColumn: 'result',
      fromRow: 0,
      toRow: undefined,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    await startExperiment({
      workspace: ctx.workspace,
      experimentUuid: experiment.uuid,
    }).then((r) => r.unwrap())

    return experiment
  })
