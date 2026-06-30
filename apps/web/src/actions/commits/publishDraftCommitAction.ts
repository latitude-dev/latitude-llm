'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { updateAndMergeCommit } from '@latitude-data/core/services/commits/updateAndMerge'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { DISABLE_VERSION_DEPLOY_FLAG } from '@latitude-data/core/services/workspaceFeatures/flags'
import { UnprocessableEntityError } from '@latitude-data/constants/errors'
import { z } from 'zod'

import { withProject, withProjectSchema } from '../procedures'

export const publishDraftCommitAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { workspace } = ctx
    const { id: commitId, title, description } = parsedInput

    // Deploying from Latitude's own UI can be disabled per workspace (e.g. for
    // customers that deploy through their own version control). This only gates
    // the in-app action: deploys via the public API are intentionally allowed.
    const deployDisabled = await isFeatureEnabledByName(
      workspace.id,
      DISABLE_VERSION_DEPLOY_FLAG,
    ).then((r) => r.unwrap())
    if (deployDisabled) {
      throw new UnprocessableEntityError(
        'Deploying versions has been disabled for this workspace by your Latitude administrator.',
      )
    }

    const commitScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitScope
      .getCommitById(commitId)
      .then((r) => r.unwrap())

    return updateAndMergeCommit({
      commit,
      workspace,
      data: {
        title,
        description,
      },
    }).then((r) => r.unwrap())
  })
