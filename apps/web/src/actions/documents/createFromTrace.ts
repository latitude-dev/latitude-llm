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

import { authProcedure } from '../procedures'
import { captureException, captureMessage } from '$/helpers/captureException'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import SpanRepository from '@latitude-data/core/repositories/spanRepository'
import { unsafelyFindProject } from '@latitude-data/core/data-access'

export const createDocumentVersionFromTraceAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      projectId: z.coerce.number(),
      commitUuid: z.string(),
      spanId: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const { workspace } = ctx
    const { commitUuid, projectId, spanId } = input
    const commitsRepo = new CommitsRepository(workspace.id)
    const commit = await commitsRepo
      .getCommitByUuid({ projectId, uuid: commitUuid })
      .then((r) => r.unwrap())

    if (commit.mergedAt) {
      throw new BadRequestError(
        'This project version has already been published so we cannot create new prompts in it. Please create a new draft version and try again.',
      )
    }

    const project = await unsafelyFindProject(projectId)
    if (!project) {
      throw new BadRequestError(
        'Cannot find a project associated with this commit. Please contact support.',
      )
    }

    const repo = new SpanRepository(workspace.id)
    const span = await repo.findBySpanId(spanId)
    if (!span) throw new NotFoundError(`Span with id ${spanId} not found`)

    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('COPILOT_PROJECT_ID is not set')
    }
    if (!env.COPILOT_WORKSPACE_API_KEY) {
      throw new BadRequestError('COPILOT_WORKSPACE_API_KEY is not set')
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
