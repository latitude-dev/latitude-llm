'use server'

import { z } from 'zod'

import { ParameterType } from '@latitude-data/constants'
import { saveLinkedDataset } from '@latitude-data/core/services/documents/saveLinkedDataset'
import { withDataset, withDatasetSchema } from '../procedures'

const parameterTypeSchema = z.enum(ParameterType)
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
  .inputSchema(
    withDatasetSchema.extend({
      datasetRowId: z.number(),
      mappedInputs: z.record(z.string(), z.string()),
      inputs: z.record(z.string(), datasetInputSchema),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    return await saveLinkedDataset({
      document: ctx.document,
      dataset: ctx.dataset,
      data: {
        datasetRowId: parsedInput.datasetRowId,
        mappedInputs: parsedInput.mappedInputs,
        inputs: parsedInput.inputs,
      },
    }).then((r) => r.unwrap())
  })
