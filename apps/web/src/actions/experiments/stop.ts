'use server'

import { withDocument, withDocumentSchema } from '../procedures'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'
import { stopExperiment } from '@latitude-data/core/services/experiments/stop'

export const stopExperimentAction = withDocument
  .inputSchema(withDocumentSchema.extend({ experimentUuid: z.string() }))
  .action(async ({ ctx, parsedInput }) => {
    const { experimentUuid } = parsedInput
    const experimentsScope = new ExperimentsRepository(ctx.workspace.id)
    const experiment = await experimentsScope
      .findByUuid(experimentUuid)
      .then((r) => r.unwrap())

    const updatedExperiment = await stopExperiment({
      experiment,
      workspaceId: ctx.workspace.id,
    }).then((r) => r.unwrap())

    return updatedExperiment
  })
