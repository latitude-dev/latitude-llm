'use server'
import { publisher } from '@latitude-data/core/events/publisher'
import { BadRequestError } from '@latitude-data/constants/errors'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { findAllProviderApiKeys } from '@latitude-data/core/queries/providerApiKeys/findAll'
import { env } from '@latitude-data/env'
import { z } from 'zod'

import { authProcedure } from '../procedures'
import { CLOUD_MESSAGES } from '@latitude-data/core/constants'
import { listModelsForProvider } from '@latitude-data/core/services/ai/providers/models/index'
import { runCopilot } from '@latitude-data/core/services/copilot/run'

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

    const providers = await findAllProviderApiKeys({
      workspaceId: ctx.workspace.id,
    }).then((list) =>
      list.map((p) => ({
        name: p.name,
        provider: p.provider,
        models: Object.values(
          listModelsForProvider({
            provider: p.provider,
          }).map((m) => m.id),
        ),
      })),
    )

    const result = await runCopilot({
      path: env.COPILOT_PROMPT_EDITOR_COPILOT_PATH,
      parameters: {
        prompt: document.content,
        request,
        providers,
      },
      schema: z.object({
        code: z.string(),
        response: z.string(),
      }),
    })

    if (result.error) throw result.error

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

    return result.value
  })
