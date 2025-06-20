import { type PromptLFile } from 'promptl-ai'
import {
  DocumentLog,
  DocumentTriggerParameters,
  LogSources,
} from '@latitude-data/constants'
import {
  CommitsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
} from '../../../../repositories'
import { database } from '../../../../client'
import { runDocumentAtCommit } from '../../../../services/commits'
import { unsafelyFindWorkspace } from '../../../../data-access'
import { DocumentTrigger, Workspace } from '../../../../browser'
import { type AssistantMessage } from '@latitude-data/compiler'
import { uploadFile } from '../../../../services/files'
import { EmailTriggerConfiguration } from '../../../../services/documentTriggers/helpers/schema'
import { BadRequestError } from './../../../../lib/errors'
import { PromisedResult } from './../../../../lib/Transaction'
import { Result } from './../../../../lib/Result'

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

  const documentsScope = new DocumentVersionsRepository(
    trigger.workspaceId,
    db,
    { includeDeleted: true },
  )
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
    Object.entries(
      (trigger.configuration as EmailTriggerConfiguration).parameters ?? {},
    ).map(([key, value]: [string, DocumentTriggerParameters]) => {
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
    }),
  )

  const runResult = await runDocumentAtCommit({
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

export async function findReferencedLog(
  {
    workspace,
    documentUuid,
    parentMessageIds,
  }: {
    workspace: Workspace
    documentUuid: string
    parentMessageIds?: string[]
  },
  db = database,
): PromisedResult<DocumentLog | undefined, Error> {
  const conversationIdentifier = parentMessageIds?.[0]
  if (!conversationIdentifier) return Result.nil()

  const documentLogScope = new DocumentLogsRepository(workspace.id, db)
  const logResults = await documentLogScope.findByFields({
    documentUuid,
    source: LogSources.EmailTrigger,
    customIdentifier: conversationIdentifier,
  })

  if (logResults.length) {
    return Result.ok(logResults[0]!)
  }

  return Result.nil()
}

export async function uploadAttachments({
  workspace,
  attachments,
}: {
  workspace: Workspace
  attachments: File[]
}): PromisedResult<PromptLFile[], Error> {
  const results = await Promise.all(
    attachments.map(async (file) => {
      return await uploadFile({ file, workspace })
    }),
  )

  const errors = results.filter((result) => result.error)
  if (errors.length) {
    return Result.error(errors[0]!.error!)
  }

  return Result.ok(results.map((result) => result.unwrap()))
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
  const workspace = (await unsafelyFindWorkspace(
    trigger.workspaceId,
    db,
  )) as Workspace

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
    subject: 'Re: ' + subject,
    body,
    attachments,
  })
}
