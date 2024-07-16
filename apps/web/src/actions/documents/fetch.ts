'use server'

import { materializeDocumentsAtCommit } from '@latitude-data/core'
import { z } from 'zod'

import { withProject } from '../procedures'

export const getDocumentsAtCommitAction = withProject
  .createServerAction()
  .input(z.object({ commitUuid: z.string() }))
  .handler(async ({ input }) => {
    const result = await materializeDocumentsAtCommit({
      commitUuid: input.commitUuid,
    })

    return result.unwrap()
  })
