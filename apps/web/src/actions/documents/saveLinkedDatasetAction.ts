'use server'

import {
  DatasetsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withDocument } from '../procedures'
import { DatasetVersion, ParameterType } from '@latitude-data/constants'
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
const inputsSchema = z.record(datasetInputSchema)

const mappedInputsSchema = z.record(z.number())

export const saveLinkedDatasetAction = withDataset
  .createServerAction()
  .input(
    z.object({
      datasetId: z.number(),
      datasetVersion: z.nativeEnum(DatasetVersion),
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
        rowIndex: input.rowIndex,
        mappedInputs: input.mappedInputs,
        inputs: input.inputs,
      },
    }).then((r) => r.unwrap())
  })
