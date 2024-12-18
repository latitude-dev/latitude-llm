'use server'

import { getUnsafeIp } from '$/helpers/ip'
import { MAX_SIZE, MAX_UPLOAD_SIZE_IN_MB } from '@latitude-data/core/browser'
import { uploadFile } from '@latitude-data/core/services/files/upload'
import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { z } from 'zod'

import { maybeAuthProcedure, withRateLimit } from '../procedures'

export const uploadFileAction = (
  await withRateLimit(maybeAuthProcedure, {
    limit: 10,
    period: 60,
  })
)
  .createServerAction()
  .input(
    z.object({
      file: z.instanceof(File).refine(async (file) => {
        return file?.size <= MAX_UPLOAD_SIZE_IN_MB
      }, `Your file must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const ip = getUnsafeIp(await headers()) || 'unknown'
    const fingerprint = createHash('sha1').update(ip).digest('hex')

    const result = await uploadFile({
      file: input.file,
      prefix: ctx.workspace ? undefined : fingerprint,
      workspace: ctx.workspace,
    })

    return result.unwrap()
  })
