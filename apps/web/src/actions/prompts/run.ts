'use server'

import { LogSources } from '@latitude-data/core/browser'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runPrompt } from '@latitude-data/core/services/prompts/run'
import { buildProviderApikeysMap } from '@latitude-data/core/services/providerApiKeys/buildMap'
import { createStreamableValue } from 'ai/rsc'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const runPromptAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      prompt: z.string(),
      parameters: z.record(z.any()),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { prompt, parameters } = input
    const stream = createStreamableValue()
    try {
      const result = await runPrompt({
        source: LogSources.Evaluation,
        prompt,
        parameters,
        apikeys: await buildProviderApikeysMap({
          workspaceId: ctx.workspace.id,
        }),
      }).then((r) => r.unwrap())

      pipeToStream(result.stream, stream)

      return {
        output: stream.value,
        response: result.response,
      }
    } catch (error) {
      stream.error(error)
      stream.done()

      throw error
    }
  })

async function pipeToStream(
  source: ReadableStream,
  target: ReturnType<typeof createStreamableValue>,
) {
  for await (const chunk of streamToGenerator(source)) {
    target.update(chunk)
  }

  target.done()
}
