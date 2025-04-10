'use server'

import { LogSources } from '@latitude-data/core/browser'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runPrompt } from '@latitude-data/core/services/prompts/run'
import { buildProvidersMap } from '@latitude-data/core/services/providerApiKeys/buildMap'
import { createStreamableValue } from 'ai/rsc'
import { z } from 'zod'

import { NotFoundError } from '@latitude-data/core/lib/errors'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { authProcedure } from '../procedures'

export const runEvaluationPromptAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      evaluationId: z.number(),
      prompt: z.string(),
      parameters: z.record(z.any()),
      promptlVersion: z.number(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { prompt, parameters, promptlVersion, evaluationId } = input
    const { workspace } = ctx

    const evaluationScope = new EvaluationsRepository(workspace.id)
    const evaluationResult = await evaluationScope.find(evaluationId)
    if (evaluationResult.error) {
      throw new NotFoundError('Evaluation not found')
    }

    const stream = createStreamableValue()
    try {
      const run = await runPrompt({
        workspace,
        source: LogSources.Evaluation,
        prompt,
        promptlVersion,
        parameters,
        providersMap: await buildProvidersMap({
          workspaceId: ctx.workspace.id,
        }),
        promptSource: { ...evaluationResult.unwrap(), version: 'v1' as const },
      }).then((r) => r.unwrap())

      pipeToStream(run.stream, stream)

      return {
        output: stream.value,
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
