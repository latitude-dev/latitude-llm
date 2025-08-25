'use server'

import { DELIMITERS_KEYS, MAX_SIZE, MAX_UPLOAD_SIZE_IN_MB } from '@latitude-data/core/browser'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { bulkUploadDocumentLogs } from '@latitude-data/core/services/documentLogs/bulkUpload'
import { z } from 'zod'

import { withDocument } from '../procedures'

export const uploadDocumentLogsAction = withDocument
  .createServerAction()
  .input(
    z.object({
      csvDelimiter: z.enum(DELIMITERS_KEYS, {
        message: 'Choose a valid delimiter option',
      }),
      logsFile: z
        .instanceof(File)
        .refine(async (file) => {
          return !file || file.size <= MAX_UPLOAD_SIZE_IN_MB
        }, `Your file must be less than ${MAX_SIZE}MB in size`)
        .refine(async (file) => file.type === 'text/csv', 'Your file must be a CSV file'),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const commitsScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitsScope
      .getCommitByUuid({
        projectId: ctx.project.id,
        uuid: ctx.currentCommitUuid,
      })
      .then((r) => r.unwrap())

    await bulkUploadDocumentLogs({
      workspace: ctx.workspace,
      document: ctx.document,
      commit,
      csvDelimiter: input.csvDelimiter,
      logsFile: input.logsFile,
    })

    return { success: true }
  })
