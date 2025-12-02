'use server'
import { publisher } from '@latitude-data/core/events/publisher'
import { BadRequestError } from '@latitude-data/constants/errors'
import {
  DocumentVersionsRepository,
  ProviderApiKeysRepository,
} from '@latitude-data/core/repositories'
import { env } from '@latitude-data/env'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { z } from 'zod'

import { authProcedure } from '../procedures'
import { CLOUD_MESSAGES } from '@latitude-data/core/constants'
import { listModelsForProvider } from '@latitude-data/core/services/ai/providers/models/index'

// TODO: Make this generic. Pass prompts: string
// Pass entityUuid and entityType so this can be used to track
// events for documents and evaluations. Now the event is tied to documents
export const requestSuggestionAction = authProcedure
  .inputSchema(
    z.object({
      projectId: z.number(),
      commitUuid: z.string(),
      documentUuid: z.string(),
      request: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    if (!env.LATITUDE_CLOUD) {
      throw new BadRequestError(CLOUD_MESSAGES.promptSuggestions)
    }

    if (!env.COPILOT_WORKSPACE_API_KEY) {
      throw new BadRequestError('COPILOT_WORKSPACE_API_KEY is not set')
    }

    if (!env.COPILOT_PROJECT_ID) {
      throw new BadRequestError('COPILOT_PROJECT_ID is not set')
    }

    if (!env.COPILOT_PROMPT_EDITOR_COPILOT_PATH) {
      throw new BadRequestError('COPILOT_PROMPT_EDITOR_COPILOT_PATH is not set')
    }

    const { projectId, commitUuid, documentUuid, request } = parsedInput

    const documentsScope = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await documentsScope
      .getDocumentAtCommit({
        projectId,
        commitUuid,
        documentUuid,
      })
      .then((r) => r.unwrap())

    const providersScope = new ProviderApiKeysRepository(ctx.workspace.id)
    const providers = await providersScope.findAll().then((r) =>
      r.unwrap().map((p) => ({
        name: p.name,
        provider: p.provider,
        models: Object.values(
          listModelsForProvider({
            provider: p.provider,
          }),
        ),
      })),
    )

    const sdk = await createSdk({
      workspace: ctx.workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY,
      projectId: env.COPILOT_PROJECT_ID,
    }).then((r) => r.unwrap())

    const result = await sdk.prompts.run<{ code: string; response: string }>(
      env.COPILOT_PROMPT_EDITOR_COPILOT_PATH,
      {
        stream: false,
        parameters: {
          prompt: document.content,
          request,
          providers,
        },
      },
    )

    if (!result) throw new Error('Failed to request prompt suggestion')

    publisher.publishLater({
      type: 'copilotSuggestionGenerated',
      data: {
        userEmail: ctx.user.email,
        workspaceId: ctx.workspace.id,
        projectId,
        commitUuid,
        documentUuid,
      },
    })

    const resultResponse = result.response
    return resultResponse.object
  })
