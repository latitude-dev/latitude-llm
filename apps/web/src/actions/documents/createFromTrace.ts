'use server'

import { ChainStepObjectResponse } from '@latitude-data/core/browser'
import { database } from '@latitude-data/core/client'
import { BadRequestError, NotFoundError } from '@latitude-data/core/lib/errors'
import {
  CommitsRepository,
  ProviderApiKeysRepository,
} from '@latitude-data/core/repositories'
import { spans } from '@latitude-data/core/schema'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { env } from '@latitude-data/env'
import { Latitude } from '@latitude-data/sdk'
import { ConsoleLogWriter, eq } from 'drizzle-orm'
import { z } from 'zod'

import { withProject } from '../procedures'

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

    // TODO: move to repository
    const span = await database.query.spans.findFirst({
      // @ts-expect-error
      where: eq(spans.spanId, spanId),
    })
    if (!span) {
      throw new NotFoundError(`Span with id ${spanId} not found`)
    }

    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('DATASET_GENERATOR_PROJECT_ID is not set')
    }
    if (!env.COPILOT_PROMPT_FROM_TRACE_PROMPT_PATH) {
      throw new BadRequestError('DATASET_GENERATOR_DOCUMENT_PATH is not set')
    }
    if (!env.COPILOT_WORKSPACE_API_KEY) {
      throw new BadRequestError('DATASET_GENERATOR_WORKSPACE_APIKEY is not set')
    }

    console.log(
      env.COPILOT_PROJECT_ID,
      env.COPILOT_PROMPT_FROM_TRACE_PROMPT_PATH,
    )

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providerApiKeys = await providersScope.findAll()

    const sdk = new Latitude(env.COPILOT_WORKSPACE_API_KEY, {
      projectId: 60,
      gateway: {
        host: 'gateway.latitude.so',
        ssl: true,
        port: 443,
      },
    })

    const parameters = {
      input: span.input,
      output: span.output,
      functions: span.toolCalls,
      model: span.model,
      modelParameters: span.modelParameters,
      providers: providerApiKeys.unwrap(),
    }
    console.log(parameters)
    const result = await sdk.prompts.run(
      env.COPILOT_PROMPT_FROM_TRACE_PROMPT_PATH,
      {
        versionUuid: 'a10996f5-5b5b-485b-a0b9-b5e799f175ee',
        parameters,
      },
    )

    const response = result.response as ChainStepObjectResponse
    console.log(response)
    if (!response.object.success) {
      throw new BadRequestError(
        'The LLM agent did not succeed at creating a valid prompt from the provided log',
      )
    }

    return createNewDocument({
      workspace,
      commit,
      path: response.object.name,
      content: response.object.prompt,
    }).then((r) => r.unwrap())
  })
