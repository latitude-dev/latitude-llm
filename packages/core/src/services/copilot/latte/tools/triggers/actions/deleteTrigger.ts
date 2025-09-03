import { z } from 'zod'
import {
  CommitsRepository,
  ProjectsRepository,
} from '../../../../../../repositories'
import { defineLatteTool } from '../../types'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '../../../../../../lib/Result'
import { DocumentTriggerType } from '@latitude-data/constants'
import { integrationTriggerConfigurationSchema } from '@latitude-data/constants/documentTriggers'
import { getTriggerDocument } from './getTriggerDocument'
import { deleteDocumentTrigger } from '../../../../../documentTriggers/delete'
import { PromisedResult } from '../../../../../../lib/Transaction'
import { LatteTriggerChanges } from '@latitude-data/constants/latte'

const deleteTrigger = defineLatteTool(
  async (
    { projectId, versionUuid, promptUuid, action },
    { workspace },
  ): PromisedResult<LatteTriggerChanges> => {
    const commitsScope = new CommitsRepository(workspace.id)

    const currentVersionCommit = await commitsScope
      .getCommitByUuid({
        projectId: projectId,
        uuid: versionUuid,
      })
      .then((r) => r.unwrap())

    if (currentVersionCommit.mergedAt) {
      return Result.error(
        new BadRequestError('Cannot delete a trigger in a live version'),
      )
    }

    const triggerResult = await getTriggerDocument(
      action,
      workspace.id,
      currentVersionCommit,
      promptUuid,
    )

    if (!triggerResult.ok) {
      return Result.error(triggerResult.error!)
    }

    const documentTrigger = triggerResult.unwrap()

    if (action.triggerType === DocumentTriggerType.Integration) {
      const projectsRepository = new ProjectsRepository(workspace.id)
      const project = await projectsRepository
        .getProjectById(currentVersionCommit.projectId)
        .then((r) => r.unwrap())

      if (!project) {
        return Result.error(
          new NotFoundError(
            `Project with ID ${currentVersionCommit.projectId} not found.`,
          ),
        )
      }
    }

    const result = await deleteDocumentTrigger({
      workspace,
      commit: currentVersionCommit,
      triggerUuid: documentTrigger.uuid,
    })

    if (!result.ok) {
      return Result.error(result.error!)
    }

    return Result.ok({
      projectId: currentVersionCommit.projectId,
      versionUuid: currentVersionCommit.uuid,
      promptUuid: promptUuid,
      triggerType: action.triggerType,
    })
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
    promptUuid: z.string(),
    action: z.union([
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
    ]),
  }),
)

export default deleteTrigger
