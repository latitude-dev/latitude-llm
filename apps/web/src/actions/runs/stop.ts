'use server'

import { RunsRepository } from '@latitude-data/core/repositories'
import { stopRun } from '@latitude-data/core/services/runs/stop'
import { z } from 'zod'
import { withProject } from '../procedures'

export const stopRunAction = withProject
  .createServerAction()
  .input(z.object({ runUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const repository = new RunsRepository(ctx.workspace.id, ctx.project.id)
    const run = await repository
      .get({ runUuid: input.runUuid })
      .then((r) => r.unwrap())

    const result = await stopRun({
      run: run,
      project: ctx.project,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
