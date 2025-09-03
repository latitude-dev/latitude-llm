import { z } from 'zod'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '../../../../../../repositories'
import { defineLatteTool } from '../../types'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '../../../../../../lib/Result'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  emailTriggerConfigurationSchema,
  integrationTriggerConfigurationSchema,
  scheduledTriggerConfigurationSchema,
} from '@latitude-data/constants/documentTriggers'
import { createDocumentTrigger } from '../../../../../documentTriggers/create'
import { PromisedResult } from '../../../../../../lib/Transaction'
import { LatteTriggerChanges } from '@latitude-data/constants/latte'

const createTrigger = defineLatteTool(
  async (
    { projectId, versionUuid, promptUuid, action },
    { workspace },
  ): PromisedResult<LatteTriggerChanges> => {
    const commitsScope = new CommitsRepository(workspace.id)
    const currentVersionCommit = await commitsScope
      .getCommitByUuid({ projectId, uuid: versionUuid })
      .then((r) => r.unwrap())

    if (currentVersionCommit.mergedAt) {
      return Result.error(
        new BadRequestError(
          'Cannot create document trigger in a merged commit',
        ),
      )
    }

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const documents = await documentsScope
      .getDocumentsAtCommit(currentVersionCommit)
      .then((r) => r.unwrap())

    const document = documents.find((doc) => doc.documentUuid === promptUuid)

    const projectRepository = new ProjectsRepository(workspace.id)
    const project = await projectRepository
      .getProjectById(currentVersionCommit.projectId)
      .then((r) => r.unwrap())

    if (!document) {
      return Result.error(
        new NotFoundError(
          `Document with UUID ${promptUuid} not found in commit ${currentVersionCommit.uuid}.`,
        ),
      )
    }

    const result = await createDocumentTrigger({
      workspace,
      project,
      commit: currentVersionCommit,
      document: document,
      triggerType: action.triggerType,
      configuration: action.configuration,
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
        configuration: emailTriggerConfigurationSchema,
      }),
      z.object({
        triggerType: z.literal(DocumentTriggerType.Scheduled),
        configuration: scheduledTriggerConfigurationSchema,
      }),
      z.object({
        triggerType: z.literal(DocumentTriggerType.Integration),
        configuration: integrationTriggerConfigurationSchema,
      }),
    ]),
  }),
)

export default createTrigger
