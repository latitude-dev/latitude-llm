import { DocumentTriggerType } from '@latitude-data/constants'
import {
  emailTriggerConfigurationSchema,
  insertScheduledTriggerConfigurationSchema,
} from '@latitude-data/constants/documentTriggers'
import { BadRequestError } from '@latitude-data/constants/errors'
import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import Transaction from '../../../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../../repositories'
import { defineLatteTool } from '../types'
import executeTriggerActions from './executeTriggerActions'

const triggerActions = defineLatteTool(
  async ({ projectId, versionUuid, actions }, { workspace }) => {
    const commitsScope = new CommitsRepository(workspace.id)

    const headCommit = await commitsScope
      .getHeadCommit(projectId)
      .then((r) => r.unwrap())

    if (headCommit == undefined || versionUuid === headCommit.uuid) {
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
          { workspace, commit: headCommit, documents, action },
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
    actions: z.array(
      z.union([
        z.object({
          operation: z.literal('create'),
          triggerType: z.literal(DocumentTriggerType.Email),
          promptUuid: z.string(),
          configuration: emailTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('create'),
          triggerType: z.literal(DocumentTriggerType.Scheduled),
          promptUuid: z.string(),
          configuration: insertScheduledTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('delete'),
          triggerType: z.literal(DocumentTriggerType.Email),
          promptUuid: z.string(),
        }),
        z.object({
          operation: z.literal('delete'),
          triggerType: z.literal(DocumentTriggerType.Scheduled),
          promptUuid: z.string(),
        }),
        z.object({
          operation: z.literal('update'),
          triggerType: z.literal(DocumentTriggerType.Email),
          promptUuid: z.string(),
          configuration: emailTriggerConfigurationSchema,
        }),
        z.object({
          operation: z.literal('update'),
          triggerType: z.literal(DocumentTriggerType.Scheduled),
          promptUuid: z.string(),
          configuration: insertScheduledTriggerConfigurationSchema,
        }),
      ]),
    ),
  }),
)

export default triggerActions
