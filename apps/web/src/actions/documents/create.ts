'use server'

import { getFeatureFlagsForWorkspaceCached } from '$/components/Providers/FeatureFlags/getFeatureFlagsForWorkspace'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { z } from 'zod'
import { withProject } from '../procedures'

export const createDocumentVersionAction = withProject
  .createServerAction()
  .input(
    z.object({
      commitUuid: z.string(),
      path: z.string(),
      content: z.string().optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitByUuid({ uuid: input.commitUuid, projectId: ctx.project.id })
      .then((r) => r.unwrap())

    const flags = getFeatureFlagsForWorkspaceCached({
      workspace: ctx.workspace,
    })

    const result = await createNewDocument({
      workspace: ctx.workspace,
      user: ctx.user,
      commit,
      path: input.path,
      evaluationsV2Enabled: flags.evaluationsV2.enabled,
      createDemoEvaluation: true,
    })

    return result.unwrap()
  })
