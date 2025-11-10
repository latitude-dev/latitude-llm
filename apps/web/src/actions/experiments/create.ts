'use server'

import { withDocument, withDocumentSchema } from '../procedures'
import { createExperimentVariants } from '@latitude-data/core/services/experiments/createVariants'
import { startExperiment } from '@latitude-data/core/services/experiments/start/index'
import {
  DatasetsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import {
  experimentVariantSchema,
  experimentParametersSourceSchema,
} from '@latitude-data/constants/experiments'
import { z } from 'zod'

export const createExperimentAction = withDocument
  .inputSchema(
    withDocumentSchema.extend({
      variants: z.array(experimentVariantSchema),
      evaluationUuids: z.array(z.string()),
      parametersPopulation: experimentParametersSourceSchema,
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
      parametersPopulation,
      simulationSettings,
    } = parsedInput

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

    // Resolve dataset if needed and build proper input for service
    let serviceInput
    if (parametersPopulation.source === 'dataset') {
      const datasetsScope = new DatasetsRepository(ctx.workspace.id)
      const dataset = await datasetsScope
        .find(parametersPopulation.datasetId)
        .then((r) => r.unwrap())

      serviceInput = {
        source: 'dataset' as const,
        dataset,
        fromRow: parametersPopulation.fromRow,
        toRow: parametersPopulation.toRow,
        datasetLabels: parametersPopulation.datasetLabels,
        parametersMap: parametersPopulation.parametersMap,
      }
    } else {
      // logs or manual - pass through as-is
      serviceInput = parametersPopulation
    }

    const experiments = await createExperimentVariants({
      user: ctx.user,
      workspace: ctx.workspace,
      commit: ctx.commit,
      document: ctx.document,
      variants,
      evaluations,
      parametersPopulation: serviceInput,
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
