import { DocumentTriggerParameters, LogSources } from '@latitude-data/constants'
import type { AssistantMessage } from '@latitude-data/constants/legacyCompiler'
import type { PromptLFile } from 'promptl-ai'
import type { DocumentTrigger, Workspace } from '../../../../browser'
import { database } from '../../../../client'
import { unsafelyFindWorkspace } from '../../../../data-access'
import { BadRequestError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import type { PromisedResult } from '../../../../lib/Transaction'
import { CommitsRepository, DocumentVersionsRepository } from '../../../../repositories'
import { runDocumentAtCommit } from '../../../../services/commits'

import { BACKGROUND } from '../../../../telemetry'
import type { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'

async function getNewTriggerResponse(
  {
    workspace,
    trigger,
    messageId,
    senderEmail,
    senderName,
    subject,
    body,
    attachments,
  }: {
    workspace: Workspace
    trigger: DocumentTrigger
    messageId?: string
    senderEmail: string
    senderName: string | undefined
    subject: string
    body: string
    attachments?: PromptLFile[]
  },
  db = database,
): PromisedResult<AssistantMessage, Error> {
  const commitsScope = new CommitsRepository(trigger.workspaceId, db)
  const headCommitResult = await commitsScope.getHeadCommit(trigger.projectId)
  if (headCommitResult.error) return headCommitResult.error
  const headCommit = headCommitResult.unwrap()

  if (!headCommit) {
    return Result.error(new BadRequestError('No head commit found'))
  }

  const documentsScope = new DocumentVersionsRepository(trigger.workspaceId, db, {
    includeDeleted: true,
  })
  const docResult = await documentsScope.getDocumentAtCommit({
    documentUuid: trigger.documentUuid,
    commitUuid: headCommit.uuid,
  })
  if (docResult.error) return Result.error(docResult.error)
  const document = docResult.unwrap()

  if (document.deletedAt) {
    return Result.error(new BadRequestError('Document is deleted'))
  }

  const parameters = Object.fromEntries(
    Object.entries((trigger.configuration as EmailTriggerConfiguration).parameters ?? {}).map(
      ([key, value]: [string, DocumentTriggerParameters]) => {
        if (value === DocumentTriggerParameters.SenderName) {
          return [key, senderName]
        }
        if (value === DocumentTriggerParameters.SenderEmail) {
          return [key, senderEmail]
        }
        if (value === DocumentTriggerParameters.Subject) {
          return [key, subject]
        }
        if (value === DocumentTriggerParameters.Body) {
          return [key, body]
        }
        if (value === DocumentTriggerParameters.Attachments) {
          return [key, attachments ?? []]
        }
        return [key, undefined]
      },
    ),
  )

  const runResult = await runDocumentAtCommit({
    context: BACKGROUND({ workspaceId: workspace.id }),
    workspace,
    document,
    commit: headCommit,
    parameters,
    source: LogSources.EmailTrigger,
    customIdentifier: messageId,
  })

  if (runResult.error) return Result.error(runResult.error)
  const run = runResult.unwrap()

  const runError = await run.error
  if (runError) return Result.error(runError)

  const messages = await run.messages

  return Result.ok(messages.at(-1) as AssistantMessage)
}

export async function getEmailResponse(
  {
    trigger,
    messageId,
    senderEmail,
    senderName,
    subject,
    body,
    attachments,
  }: {
    documentUuid: string
    trigger: DocumentTrigger
    messageId?: string
    parentMessageIds?: string[]
    senderEmail: string
    senderName: string | undefined
    subject: string
    body: string
    attachments?: PromptLFile[]
  },
  db = database,
): PromisedResult<AssistantMessage, Error> {
  const workspace = (await unsafelyFindWorkspace(trigger.workspaceId, db)) as Workspace

  // TODO: Re-enable "follow-up" when we successfully include the References header into the response email.
  // Until then, it does not work for conversation threads, and it is working unexpectedly for
  // emails resent to the prompt from the same thread, which should just re-run the original prompt,
  // but instead it is triggering a "follow up" response.

  return await getNewTriggerResponse({
    workspace,
    trigger,
    messageId,
    senderEmail,
    senderName,
    subject: `Re: ${subject}`,
    body,
    attachments,
  })
}
