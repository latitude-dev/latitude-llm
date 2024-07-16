'use server'

import { createCommit } from '@latitude-data/core'

import { withProject } from '../procedures'

export const createCommitAction = withProject
  .createServerAction()
  .handler(async ({ input }) => {
    const result = await createCommit({ projectId: input.projectId })
    return result.unwrap()
  })
