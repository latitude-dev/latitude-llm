'use server'

import { stopRun } from '@latitude-data/core/services/runs/stop'
import { withRun } from '../procedures'

export const stopRunAction = withRun
  .createServerAction()
  .handler(async ({ ctx }) => {
    const result = await stopRun({
      run: ctx.run,
      project: ctx.project,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
