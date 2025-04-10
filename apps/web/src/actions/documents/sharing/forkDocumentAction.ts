'use server'

import { getFeatureFlagsForWorkspaceCached } from '$/components/Providers/FeatureFlags/getFeatureFlagsForWorkspace'
import { forkDocument } from '@latitude-data/core/services/documents/forkDocument'
import { findSharedDocument } from '@latitude-data/core/services/publishedDocuments/findSharedDocument'
import { env } from '@latitude-data/env'
import { z } from 'zod'
import { authProcedure } from '../../procedures'

export const forkDocumentAction = authProcedure
  .createServerAction()
  .input(z.object({ publishedDocumentUuid: z.string() }))
  .handler(async ({ ctx, input }) => {
    const { workspace, commit, document, shared } = await findSharedDocument({
      publishedDocumentUuid: input.publishedDocumentUuid,
    }).then((r) => r.unwrap())

    const flags = getFeatureFlagsForWorkspaceCached({
      workspace: ctx.workspace,
    })

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
      evaluationsV2Enabled: flags.evaluationsV2.enabled,
    }).then((r) => r.unwrap())
  })
