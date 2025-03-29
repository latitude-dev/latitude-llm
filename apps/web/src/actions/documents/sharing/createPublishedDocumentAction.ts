'use server'

import { createPublishedDocument } from '@latitude-data/core'

import { withDocument } from '../../procedures'

export const createPublishedDocumentAction = withDocument
  .createServerAction()
  .handler(async ({ ctx }) => {
    return createPublishedDocument({
      workspace: ctx.workspace,
      project: ctx.project,
      document: ctx.document,
      commitUuid: ctx.currentCommitUuid,
    }).then((r) => r.unwrap())
  })
