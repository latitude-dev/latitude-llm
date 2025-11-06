'use server'

import { withDocument, withDocumentSchema } from '../procedures'
import { createExperimentVariants } from '@latitude-data/core/services/experiments/createVariants'
import { startExperiment } from '@latitude-data/core/services/experiments/start/index'
import {
  DatasetsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import { experimentVariantSchema } from '@latitude-data/constants/experiments'
import { z } from 'zod'

export const createExperimentAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      variants: z.array(experimentVariantSchema),
      evaluationUuids: z.array(z.string()),
      datasetId: z.number().optional(),
      parametersMap: z.record(z.string(), z.number()),
      datasetLabels: z.record(z.string(), z.string()),
      fromRow: z.number(),
      toRow: z.number().optional(),
      simulationSettings: z.object({
        simulateToolResponses: z.boolean().optional(),
        simulatedTools: z.array(z.string()).optional(),
        toolSimulationInstructions: z.string().optional(),
      }),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const {
      variants,
      evaluationUuids,
      datasetId,
      parametersMap,
      datasetLabels,
      fromRow,
      toRow,
      simulationSettings,
    } = parsedInput
    const datasetsScope = new DatasetsRepository(ctx.workspace.id)
    const dataset = datasetId
      ? await datasetsScope.find(datasetId).then((r) => r.unwrap())
      : undefined

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

    const experiments = await createExperimentVariants({
      user: ctx.user,
      workspace: ctx.workspace,
      commit: ctx.commit,
      document: ctx.document,
      variants,
      evaluations,
      dataset,
      parametersMap,
      datasetLabels,
      fromRow,
      toRow,
      simulationSettings,
    }).then((r) => r.unwrap())

    await Promise.all(
      experiments.map((experiment) =>
        startExperiment({
          workspace: ctx.workspace,
          experimentUuid: experiment.uuid,
        }).then((r) => r.unwrap()),
      ),
    )

    return experiments
  })
