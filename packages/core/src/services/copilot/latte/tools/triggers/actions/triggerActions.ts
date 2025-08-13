import { z } from 'zod'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../../../repositories'
import { defineLatteTool } from '../../types'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../../../../lib/Result'
import Transaction from '../../../../../../lib/Transaction'
import executeTriggerActions from './executeTriggerActions'
import { DocumentTriggerType, HEAD_COMMIT } from '@latitude-data/constants'
import {
  emailTriggerConfigurationSchema,
  insertScheduledTriggerConfigurationSchema,
  insertIntegrationTriggerConfigurationSchema,
} from '@latitude-data/constants/documentTriggers'

const triggerActions = defineLatteTool(
  async ({ projectId, versionUuid, promptUuid, actions }, { workspace }) => {
    const commitsScope = new CommitsRepository(workspace.id)

    const headCommit = await commitsScope
      .getHeadCommit(projectId)
      .then((r) => r.unwrap())

    if (
      headCommit == undefined ||
      (versionUuid !== headCommit.uuid && versionUuid !== HEAD_COMMIT)
    ) {
      return Result.error(
        new BadRequestError(
          `Cannot modify/add/delete triggers on a draft commit. Select a previous live commit or publish the draft.`,
        ),
      )
    }

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const documents = await documentsScope
      .getDocumentsAtCommit(headCommit)
      .then((r) => r.unwrap())
    const transaction = new Transaction()

    return await transaction.call(async () => {
      for await (const action of actions) {
        const result = await executeTriggerActions(
          {
            workspace,
            commit: headCommit,
            promptUuid: promptUuid,
            documents,
            action,
          },
          transaction,
        )
        if (!result.ok) {
          return Result.error(result.error!)
        }
      }

      return Result.ok({
        projectId: headCommit.projectId,
        draftUuid: headCommit.uuid,
      })
    })
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
    promptUuid: z.string(),
    actions: z.array(
      z.union([
        z.object({
          operation: z.literal('create'),
          triggerType: z.literal(DocumentTriggerType.Email),
          configuration: emailTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('create'),
          triggerType: z.literal(DocumentTriggerType.Scheduled),
          configuration: insertScheduledTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('create'),
          triggerType: z.literal(DocumentTriggerType.Integration),
          configuration: insertIntegrationTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('delete'),
          triggerType: z.literal(DocumentTriggerType.Email),
        }),
        z.object({
          operation: z.literal('delete'),
          triggerType: z.literal(DocumentTriggerType.Scheduled),
        }),
        z.object({
          operation: z.literal('delete'),
          triggerType: z.literal(DocumentTriggerType.Integration),
          configuration: insertIntegrationTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('update'),
          triggerType: z.literal(DocumentTriggerType.Email),
          configuration: emailTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('update'),
          triggerType: z.literal(DocumentTriggerType.Scheduled),
          configuration: insertScheduledTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('update'),
          triggerType: z.literal(DocumentTriggerType.Integration),
          configuration: insertIntegrationTriggerConfigurationSchema,
        }),
      ]),
    ),
  }),
)

export default triggerActions
