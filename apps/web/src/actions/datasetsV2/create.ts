'use server'

import {
  DELIMITER_VALUES,
  DELIMITERS_KEYS,
  MAX_SIZE,
  MAX_UPLOAD_SIZE_IN_MB,
} from '@latitude-data/core/browser'
import { DatasetsV2Repository as DatasetsRepository } from '@latitude-data/core/repositories'
import { createDataset } from '@latitude-data/core/services/datasetsV2/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createDatasetAction = authProcedure
  .createServerAction()
  .input(
    async ({ ctx }) => {
      return z
        .object({
          name: z
            .string()
            .min(1, { message: 'Name is required' })
            .refine(
              async (name) => {
                const scope = new DatasetsRepository(ctx.workspace.id)
                const existing = await scope.findByName(name)
                return !existing.length
              },
              {
                message:
                  'This name was already used, plese use something different',
              },
            ),
          csvDelimiter: z.enum(DELIMITERS_KEYS, {
            message: 'Choose a valid delimiter option',
          }),
          csvCustomDelimiter: z.string(),
          dataset_file: z
            .instanceof(File)
            .refine(async (file) => {
              return !file || file.size <= MAX_UPLOAD_SIZE_IN_MB
            }, `Your dataset must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`)
            .refine(
              async (file) => file.type === 'text/csv',
              'Your dataset must be a CSV file',
            ),
        })
        .refine(
          async (schema) => {
            if (schema.csvDelimiter !== 'custom') return true
            return schema.csvCustomDelimiter.length > 0
          },
          {
            message: 'Custom delimiter is required',
            path: ['csvCustomDelimiter'],
          },
        )
    },
    { type: 'formData' },
  )
  .handler(async ({ input, ctx }) => {
    const csvDelimiter =
      input.csvDelimiter === 'custom'
        ? input.csvCustomDelimiter
        : DELIMITER_VALUES[input.csvDelimiter]

    const data = await createDataset({
      workspace: ctx.workspace,
      author: ctx.user,
      data: {
        name: input.name,
        file: input.dataset_file,
        csvDelimiter,
      },
    }).then((r) => r.unwrap())

    return data.dataset
  })
