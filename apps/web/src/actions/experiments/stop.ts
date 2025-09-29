'use server'

import { withDocument, withDocumentSchema } from '../procedures'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'
import { completeExperiment } from '@latitude-data/core/services/experiments/complete'

export const stopExperimentAction = withDocument
  .inputSchema(withDocumentSchema.extend({ experimentUuid: z.string() }))
  .action(async ({ ctx, parsedInput }) => {
    const { experimentUuid } = parsedInput
    const experimentsScope = new ExperimentsRepository(ctx.workspace.id)
    const experiment = await experimentsScope
      .findByUuid(experimentUuid)
      .then((r) => r.unwrap())

    const updatedExperiment = await completeExperiment(experiment).then((r) =>
      r.unwrap(),
    )
    return updatedExperiment
  })
