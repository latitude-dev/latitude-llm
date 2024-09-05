'use server'

import { createDataset } from '@latitude-data/core/services/datasets/create'
import disk from '$/lib/disk'
import { z } from 'zod'

import { authProcedure } from '../procedures'

const ACCEPTED_FILE_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
]
const MAX_SIZE = 3
const MAX_UPLOAD_SIZE_IN_MB = 3 * 1024 * 1024

export const createDatasetAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string().min(1, { message: 'Name is required' }),
      dataset_file: z
        .instanceof(File)
        .refine((file) => {
          return !file || file.size <= MAX_UPLOAD_SIZE_IN_MB
        }, `Your dataset must be less than ${MAX_SIZE}MB in size`)
        .refine((file) => {
          return ACCEPTED_FILE_TYPES.includes(file.type)
        }, 'Your dataset must be an Excel or CSV file'),
    }),
    { type: 'formData' },
  )
  .handler(async ({ input, ctx }) => {
    const result = await createDataset({
      workspace: ctx.workspace,
      author: ctx.user,
      disk: disk,
      data: {
        name: input.name,
        file: input.dataset_file,
      },
    })

    return result.unwrap()
  })
