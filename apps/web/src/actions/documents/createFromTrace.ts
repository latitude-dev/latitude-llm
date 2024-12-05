'use server'

import { ChainStepObjectResponse } from '@latitude-data/core/browser'
import { BadRequestError, NotFoundError } from '@latitude-data/core/lib/errors'
import {
  CommitsRepository,
  ProviderApiKeysRepository,
} from '@latitude-data/core/repositories'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { env } from '@latitude-data/env'
import { z } from 'zod'

import { withProject } from '../procedures'
import { captureException, captureMessage } from '$/helpers/captureException'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import SpanRepository from '@latitude-data/core/repositories/spanRepository'

export const createDocumentVersionFromTraceAction = withProject
  .createServerAction()
  .input(
    z.object({
      commitUuid: z.string(),
      spanId: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const { workspace, project } = ctx
    const { commitUuid, spanId } = input
    const commitsRepo = new CommitsRepository(workspace.id)
    const commit = await commitsRepo
      .getCommitByUuid({ uuid: commitUuid, projectId: project.id })
      .then((r) => r.unwrap())

    if (commit.mergedAt) {
      throw new BadRequestError(
        'This project version has already been published so we cannot create new prompts in it. Please create a new draft version and try again.',
      )
    }

    const repo = new SpanRepository(project.workspaceId)
    const span = await repo.findBySpanId(spanId)
    if (!span) throw new NotFoundError(`Span with id ${spanId} not found`)

    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('DATASET_GENERATOR_PROJECT_ID is not set')
    }
    if (!env.COPILOT_WORKSPACE_API_KEY) {
      throw new BadRequestError('DATASET_GENERATOR_WORKSPACE_APIKEY is not set')
    }

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providerApiKeys = await providersScope.findAll()

    const sdk = await createSdk({
      workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY,
      projectId: env.COPILOT_PROJECT_ID,
    }).then((r) => r.unwrap())

    const badRequestError = new BadRequestError(
      'The LLM agent did not succeed at creating a valid prompt from the provided trace',
    )

    if (!span.input || !span.output) throw badRequestError

    const parameters = {
      input: span.input,
      output: span.output,
      functions: span.tools || [],
      model: span.model,
      modelParameters: span.modelParameters ?? {},
      providers: providerApiKeys.unwrap(),
    }
    const result = await sdk.prompts.run('prompt-from-trace', {
      parameters,
    })

    if (!result) throw badRequestError

    const response = result.response as ChainStepObjectResponse
    if (!response.object.success) {
      throw new BadRequestError(
        response.object.noSuccessReason ||
          'The LLM agent did not succeed at creating a valid prompt from the provided trace',
      )
    }

    const fresult = await createNewDocument({
      workspace,
      commit,
      path: response.object.name,
      content: response.object.prompt,
    })

    if (fresult.error) {
      captureMessage(
        `Failed to create document from trace. This was the generated content: ${response.object.prompt}`,
      )
      captureException(fresult.error)

      throw badRequestError
    }

    return fresult.value
  })
