import { z } from 'zod'
import { CommitsRepository } from '../../../../../../repositories'
import { defineLatteTool } from '../../types'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../../../../lib/Result'
import { DocumentTriggerType } from '@latitude-data/constants'
import { integrationTriggerConfigurationSchema } from '@latitude-data/constants/documentTriggers'
import { getTriggerDocument } from './getTriggerDocument'
import { deleteDocumentTrigger } from '../../../../../documentTriggers/delete'
import { PromisedResult } from '../../../../../../lib/Transaction'
import { LatteTriggerChanges } from '@latitude-data/constants/latte'

const deleteTrigger = defineLatteTool(
  async (
    { versionUuid, promptUuid, triggerSpecification },
    { workspace, project },
  ): PromisedResult<LatteTriggerChanges> => {
    const commitsScope = new CommitsRepository(workspace.id)

    const currentVersionCommit = await commitsScope
      .getCommitByUuid({
        projectId: project.id,
        uuid: versionUuid,
      })
      .then((r) => r.unwrap())

    if (currentVersionCommit.mergedAt) {
      return Result.error(
        new BadRequestError('Cannot delete a trigger in a live version'),
      )
    }

    const triggerResult = await getTriggerDocument(
      triggerSpecification,
      workspace.id,
      currentVersionCommit,
      promptUuid,
    )

    if (!triggerResult.ok) {
      return Result.error(triggerResult.error!)
    }

    const documentTrigger = triggerResult.unwrap()
    const result = await deleteDocumentTrigger({
      workspace,
      commit: currentVersionCommit,
      triggerUuid: documentTrigger.uuid,
    })

    if (!result.ok) {
      return Result.error(result.error!)
    }

    return Result.ok({
      projectId: project.id,
      versionUuid: currentVersionCommit.uuid,
      promptUuid: promptUuid,
      triggerType: triggerSpecification.triggerType,
    })
  },
  z.object({
    versionUuid: z.string(),
    promptUuid: z.string(),
    triggerSpecification: z.union([
      z.object({
        triggerType: z.literal(DocumentTriggerType.Email),
      }),
      z.object({
        triggerType: z.literal(DocumentTriggerType.Scheduled),
      }),
      z.object({
        triggerType: z.literal(DocumentTriggerType.Integration),
        configuration: integrationTriggerConfigurationSchema,
      }),
      z.object({
        triggerType: z.literal(DocumentTriggerType.Chat),
      }),
    ]),
  }),
)

export default deleteTrigger
