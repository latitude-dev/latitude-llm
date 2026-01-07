'use server'

import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { stopExperiment } from '@latitude-data/core/services/experiments/stop'
import { z } from 'zod'
import { withDocument, withDocumentSchema } from '../procedures'

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
