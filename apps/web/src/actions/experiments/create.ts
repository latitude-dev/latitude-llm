'use server'

import { withDocument } from '../procedures'
import { createExperiment } from '@latitude-data/core/services/experiments/create'
import { startExperiment } from '@latitude-data/core/services/experiments/start/index'
import {
  DatasetsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'

export const createExperimentAction = withDocument
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      evaluationUuids: z.array(z.string()),
      datasetId: z.number(),
      parametersMap: z.record(z.string(), z.number()),
      datasetLabels: z.record(z.string(), z.string()),
      fromRow: z.number(),
      toRow: z.number().optional(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const {
      name,
      evaluationUuids,
      datasetId,
      parametersMap,
      datasetLabels,
      fromRow,
      toRow,
    } = input
    const datasetsScope = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetsScope.find(datasetId).then((r) => r.unwrap())

    const evaluationsScope = new EvaluationsV2Repository(ctx.workspace.id)
    const docEvaluations = await evaluationsScope
      .listAtCommitByDocument({
        projectId: ctx.commit.projectId,
        commitUuid: ctx.currentCommitUuid,
        documentUuid: ctx.document.documentUuid,
      })
      .then((r) => r.unwrap())

    const evaluations = docEvaluations.filter((evaluation) =>
      evaluationUuids.includes(evaluation.uuid),
    )
    if (evaluations.length !== evaluationUuids.length) {
      const missingUuids = evaluationUuids.filter(
        (uuid) => !evaluations.some((e) => e.uuid === uuid),
      )
      throw new Error(
        `The following evaluations were not found in the document: '${missingUuids.join("', '")}'`,
      )
    }

    const experiment = await createExperiment({
      name,
      document: ctx.document,
      commit: ctx.commit,
      evaluations,
      dataset,
      parametersMap,
      datasetLabels,
      fromRow,
      toRow,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    await startExperiment({
      workspace: ctx.workspace,
      experimentUuid: experiment.uuid,
    }).then((r) => r.unwrap())

    return experiment
  })
