'use server'

import { LogSources } from '@latitude-data/core/browser'
import { streamToGenerator } from '@latitude-data/core/lib'
import { runPrompt } from '@latitude-data/core/services'
import { buildProvidersMap } from '@latitude-data/core/services'
import { createStreamableValue } from 'ai/rsc'
import { z } from 'zod'

import { authProcedure } from '../procedures'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { NotFoundError } from '@latitude-data/core/lib'

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
        promptSource: evaluationResult.unwrap(),
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
