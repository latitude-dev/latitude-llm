'use server'

import { createNewDocument } from '@latitude-data/core'
import { findCommit } from '$/app/(private)/_data-access'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDocumentVersionAction = withProject
  .createServerAction()
  .input(
    z.object({
      path: z.string(),
      commitUuid: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input }) => {
    const commit = await findCommit({
      projectId: input.projectId,
      uuid: input.commitUuid,
    })
    const result = await createNewDocument({
      commitId: commit.id,
      path: input.path,
    })
    return result.unwrap()
  })
