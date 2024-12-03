'use server'

import { forkDocument } from '@latitude-data/core/services/documents/forkDocument'

import { z } from 'zod'
import { authProcedure } from '../../procedures'
import { findSharedDocument } from '@latitude-data/core/services/publishedDocuments/findSharedDocument'
import { env } from '@latitude-data/env'

export const forkDocumentAction = authProcedure
  .createServerAction()
  .input(z.object({ publishedDocumentUuid: z.string() }))
  .handler(async ({ ctx, input }) => {
    const { workspace, commit, document, shared } = await findSharedDocument({
      publishedDocumentUuid: input.publishedDocumentUuid,
    }).then((r) => r.unwrap())

    return forkDocument({
      title: shared.title ?? 'Copied Prompt',
      origin: {
        workspace,
        commit,
        document,
      },
      destination: {
        workspace: ctx.workspace,
        user: ctx.user,
      },
      defaultProviderId: env.DEFAULT_PROVIDER_ID,
    }).then((r) => r.unwrap())
  })
