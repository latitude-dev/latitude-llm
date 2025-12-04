'use server'

import { z } from 'zod'
import { getRunByDocument } from '@latitude-data/core/services/runs/active/byDocument/get'
import { stopRunByDocument } from '@latitude-data/core/services/runs/active/byDocument/stop'
import { withProject, withProjectSchema } from '../procedures'

/**
 * Stops a run using document-scoped storage.
 * This is the document-scoped version of stopRunAction.
 */
export const stopRunByDocumentAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      documentUuid: z.string(),
      runUuid: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const run = await getRunByDocument({
      workspaceId: ctx.workspace.id,
      projectId: ctx.project.id,
      documentUuid: parsedInput.documentUuid,
      runUuid: parsedInput.runUuid,
    }).then((r) => r.unwrap())

    const result = await stopRunByDocument({
      run: run,
      project: ctx.project,
      workspace: ctx.workspace,
      documentUuid: parsedInput.documentUuid,
    }).then((r) => r.unwrap())

    return result
  })
