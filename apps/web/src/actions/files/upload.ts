'use server'

import { MAX_SIZE, MAX_UPLOAD_SIZE_IN_MB } from '@latitude-data/core/browser'
import { uploadFile } from '@latitude-data/core/services/files/upload'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const uploadFileAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      file: z.instanceof(File).refine(async (file) => {
        return file?.size <= MAX_UPLOAD_SIZE_IN_MB
      }, `Your file must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const result = await uploadFile({
      file: input.file,
      workspace: ctx.workspace,
    })

    return result.unwrap()
  })
