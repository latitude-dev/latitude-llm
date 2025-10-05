'use server'

import { forkDocument } from '@latitude-data/core/services/documents/fork/index'
import { findSharedDocument } from '@latitude-data/core/services/publishedDocuments/findSharedDocument'
import { env } from '@latitude-data/env'
import { z } from 'zod'
import { authProcedure } from '../../procedures'

export const forkDocumentAction = authProcedure
  .inputSchema(z.object({ publishedDocumentUuid: z.string() }))
  .action(async ({ ctx, parsedInput }) => {
    const { workspace, commit, document, shared } = await findSharedDocument({
      publishedDocumentUuid: parsedInput.publishedDocumentUuid,
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
      defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
    }).then((r) => r.unwrap())
  })
