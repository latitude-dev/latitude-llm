'use server'

import { buildCsvFile } from '@latitude-data/core/browser'
import { createDataset } from '@latitude-data/core/services/datasets/create'
import { generateCsvFromDocumentLogs } from '@latitude-data/core/services/documentLogs/generateCsvFromDocumentLogs'
import { z } from 'zod'

import { withProject } from '../procedures'

export const saveDocumentLogsAsDataset = withProject
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      documentLogIds: z.array(z.number()),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace, user } = ctx
    const { name, documentLogIds } = input

    const csvData = await generateCsvFromDocumentLogs({
      workspace,
      documentLogIds,
    }).then((r) => r.unwrap())

    const dataset = await createDataset({
      author: user,
      workspace,
      data: {
        name,
        file: buildCsvFile(csvData, name),
        csvDelimiter: ',',
      },
    }).then((r) => r.unwrap())

    return { dataset }
  })
