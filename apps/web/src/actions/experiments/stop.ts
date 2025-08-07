'use server'

import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { completeExperiment } from '@latitude-data/core/services/experiments/complete'
import { z } from 'zod'
import { withDocument } from '../procedures'

export const stopExperimentAction = withDocument
  .createServerAction()
  .input(
    z.object({
      experimentUuid: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { experimentUuid } = input
    const experimentsScope = new ExperimentsRepository(ctx.workspace.id)
    const experiment = await experimentsScope
      .findByUuid(experimentUuid)
      .then((r) => r.unwrap())

    const updatedExperiment = await completeExperiment(experiment).then((r) =>
      r.unwrap(),
    )
    return updatedExperiment
  })
