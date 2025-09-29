'use server'

import { createDocumentTrigger } from '@latitude-data/core/services/documentTriggers/create'

import { withCommit, withCommitSchema } from '../../procedures'
import { DocumentTriggerType } from '@latitude-data/constants'
import { z } from 'zod'
import { documentTriggerConfigurationSchema } from '@latitude-data/constants/documentTriggers'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'

export const createDocumentTriggerAction = withCommit
  .inputSchema(
    withCommitSchema.extend({
      documentUuid: z.string(),
      triggerType: z.enum(DocumentTriggerType),
      configuration: documentTriggerConfigurationSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { documentUuid, triggerType, configuration } = parsedInput
    const { workspace, project, commit } = ctx

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const document = await documentsScope
      .getDocumentAtCommit({
        projectId: project.id,
        documentUuid,
        commitUuid: commit.uuid,
      })
      .then((r) => r.unwrap())

    return createDocumentTrigger({
      workspace,
      project,
      commit,
      document,
      triggerType,
      configuration,
    }).then((r) => r.unwrap())
  })
