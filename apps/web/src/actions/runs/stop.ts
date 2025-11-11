'use server'

import { getRun } from '@latitude-data/core/services/runs/get'
import { stopRun } from '@latitude-data/core/services/runs/stop'
import { z } from 'zod'
import { withProject, withProjectSchema } from '../procedures'

export const stopRunAction = withProject
  .inputSchema(withProjectSchema.extend({ runUuid: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const run = await getRun({
      workspaceId: ctx.workspace.id,
      projectId: ctx.project.id,
      runUuid: parsedInput.runUuid,
    }).then((r) => r.unwrap())

    const result = await stopRun({
      run: run,
      project: ctx.project,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
