'use server'

import { z } from 'zod'

import { ParameterType } from '@latitude-data/constants'
import { saveLinkedDataset } from '@latitude-data/core/services/documents/saveLinkedDataset'
import { withDataset } from '$/actions/evaluations/_helpers'

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
const inputsSchema = z.record(datasetInputSchema).optional()

// TODO: Remove number when migrated to datasets V2
const mappedInputsSchema = z
  .record(z.union([z.number(), z.string()]))
  .optional()

export const saveLinkedDatasetAction = withDataset
  .createServerAction()
  .input(
    z.object({
      // TODO: Make mandatory when all is migrated to datasets V2
      datasetRowId: z.number().optional(),
      rowIndex: z.number().optional(),
      mappedInputs: mappedInputsSchema,
      inputs: inputsSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    return await saveLinkedDataset({
      document: ctx.document,
      datasetVersion: ctx.datasetVersion,
      dataset: ctx.dataset,
      data: {
        datasetRowId: input.datasetRowId,
        mappedInputs: input.mappedInputs,

        // DEPRECATED: Remove when migrated to datasets V2
        rowIndex: input.rowIndex,
        inputs: input.inputs,
      },
    }).then((r) => r.unwrap())
  })
