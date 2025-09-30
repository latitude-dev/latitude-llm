'use server'

import { RunsRepository } from '@latitude-data/core/repositories'
import { stopRun } from '@latitude-data/core/services/runs/stop'
import { z } from 'zod'
import { withProject, withProjectSchema } from '../procedures'

export const stopRunAction = withProject
  .inputSchema(withProjectSchema.extend({ runUuid: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const repository = new RunsRepository(ctx.workspace.id, ctx.project.id)
    const run = await repository
      .get({ runUuid: parsedInput.runUuid })
      .then((r) => r.unwrap())

    const result = await stopRun({
      run: run,
      project: ctx.project,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
