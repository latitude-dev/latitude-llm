'use server'

import { z } from 'zod'

import { ParameterType } from '@latitude-data/constants'
import { saveLinkedDataset } from '@latitude-data/core/services/documents/saveLinkedDataset'
import { withDataset } from '../procedures'

const parameterTypeSchema = z.nativeEnum(ParameterType)
const datasetInputMetadataSchema = z.object({
  type: parameterTypeSchema.optional(),
  filename: z.string().optional(),
  includeInPrompt: z.boolean(),
})

const datasetInputSchema = z.object({
  value: z.string(),
  metadata: datasetInputMetadataSchema,
})

export const saveLinkedDatasetAction = withDataset
  .createServerAction()
  .input(
    z.object({
      datasetRowId: z.number(),
      mappedInputs: z.record(z.string()),
      inputs: z.record(datasetInputSchema),
    }),
  )
  .handler(async ({ input, ctx }) => {
    return await saveLinkedDataset({
      document: ctx.document,
      dataset: ctx.dataset,
      data: {
        datasetRowId: input.datasetRowId,
        mappedInputs: input.mappedInputs,
        inputs: input.inputs,
      },
    }).then((r) => r.unwrap())
  })
