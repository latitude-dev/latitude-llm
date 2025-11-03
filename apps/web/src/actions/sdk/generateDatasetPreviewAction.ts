'use server'
import { generatePreviewRowsFromJson } from '@latitude-data/core/services/datasetRows/generatePreviewRowsFromJson'
import { authProcedure } from '$/actions/procedures'
import { z } from 'zod'
import { generateDatasetWithCopilot } from '@latitude-data/core/services/datasets/generateWithCopilot'

export const generateDatasetPreviewAction = authProcedure
  .inputSchema(
    z.object({
      description: z.string(),
      parameters: z.string(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const generatedDatasetContent = await generateDatasetWithCopilot({
      parameters: parsedInput.parameters,
      description: parsedInput.description,
      rowCount: 10,
    }).then((r) => r.unwrap())

    const parseResult = generatePreviewRowsFromJson({
      rows: JSON.stringify(generatedDatasetContent.rows),
    })
    const { headers, rows } = parseResult.unwrap()

    return {
      headers,
      rows,
      explanation: generatedDatasetContent.explanation,
    }
  })
