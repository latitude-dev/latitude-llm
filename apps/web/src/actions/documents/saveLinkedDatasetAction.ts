'use server'

import { DatasetsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withDocument } from '../procedures'
import { ParameterType } from '@latitude-data/constants'
import { saveLinkedDataset } from '@latitude-data/core/services/documents/saveLinkedDataset'

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
const inputsSchema = z.record(datasetInputSchema)

const mappedInputsSchema = z.record(z.number())

export const saveLinkedDatasetAction = withDocument
  .createServerAction()
  .input(
    z.object({
      datasetId: z.number(),
      rowIndex: z.number(),
      mappedInputs: mappedInputsSchema,
      inputs: inputsSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { datasetId } = input
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(datasetId).then((r) => r.unwrap())

    return await saveLinkedDataset({
      document: ctx.document,
      dataset,
      data: {
        rowIndex: input.rowIndex,
        mappedInputs: input.mappedInputs,
        inputs: input.inputs,
      },
    }).then((r) => r.unwrap())
  })
