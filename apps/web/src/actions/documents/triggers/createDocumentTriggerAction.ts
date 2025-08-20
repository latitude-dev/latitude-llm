'use server'

import { createDocumentTrigger } from '@latitude-data/core/services/documentTriggers/create'

import { withCommit } from '../../procedures'
import { DocumentTriggerType } from '@latitude-data/constants'
import { z } from 'zod'
import { documentTriggerConfigurationSchema } from '@latitude-data/constants/documentTriggers'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'

export const createDocumentTriggerAction = withCommit
  .createServerAction()
  .input(
    z.object({
      documentUuid: z.string(),
      triggerType: z.nativeEnum(DocumentTriggerType),
      configuration: documentTriggerConfigurationSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { documentUuid, triggerType, configuration } = input
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
