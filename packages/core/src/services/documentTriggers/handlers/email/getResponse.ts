import {
  BadRequestError,
  LatitudeError,
  PromisedResult,
  Result,
} from '../../../../lib'
import { type PromptLFile, promptLFileToMessageContent } from 'promptl-ai'
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
import { runDocumentAtCommit } from '../../../commits/runDocumentAtCommit'
import { unsafelyFindWorkspace } from '../../../../data-access'
import { DocumentTrigger, Workspace } from '../../../../browser'
import {
  MessageRole,
  ContentType,
  type AssistantMessage,
  type UserMessage,
} from '@latitude-data/compiler'
import { addMessages } from '../../../documentLogs'
import { uploadFile } from '../../../files'

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
): PromisedResult<AssistantMessage, LatitudeError> {
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
    Object.entries(trigger.configuration.parameters ?? {}).map(
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

async function getFollowUpTriggerResponse({
  workspace,
  parentLog,
  body,
  attachments,
}: {
  workspace: Workspace
  parentLog: DocumentLog
  body: string
  attachments?: PromptLFile[]
}): PromisedResult<AssistantMessage, LatitudeError> {
  const runResult = await addMessages({
    workspace,
    documentLogUuid: parentLog.uuid,
    messages: [
      {
        role: MessageRole.user,
        content: [
          { type: ContentType.text, text: body },
          ...(attachments ?? []).map(promptLFileToMessageContent),
        ],
      } as UserMessage,
    ],
    source: LogSources.EmailTrigger,
  })

  if (runResult.error) return Result.error(runResult.error as LatitudeError)
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
): PromisedResult<DocumentLog | undefined, LatitudeError> {
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
  attachments: (string | File)[]
}): PromisedResult<PromptLFile[], LatitudeError> {
  const results = await Promise.all(
    attachments.map(async (file) => {
      if (typeof file === 'string') {
        return Result.error(
          new BadRequestError(`Invalid attachment: '${file}'`),
        )
      }

      return await uploadFile({ file, workspace })
    }),
  )

  const errors = results.filter((result) => result.error)
  if (errors.length) {
    return Result.error(errors[0]!.error! as LatitudeError)
  }

  return Result.ok(results.map((result) => result.unwrap()))
}

export async function getEmailResponse(
  {
    documentUuid,
    trigger,
    messageId,
    parentMessageIds,
    senderEmail,
    senderName,
    subject,
    body,
    attachments: attachedFiles,
  }: {
    documentUuid: string
    trigger: DocumentTrigger
    messageId?: string
    parentMessageIds?: string[]
    senderEmail: string
    senderName: string | undefined
    subject: string
    body: string
    attachments?: (string | File)[]
  },
  db = database,
): PromisedResult<AssistantMessage, LatitudeError> {
  const workspace = (await unsafelyFindWorkspace(
    trigger.workspaceId,
    db,
  )) as Workspace

  const attachmentsResult = await uploadAttachments({
    workspace,
    attachments: attachedFiles ?? [],
  })
  if (attachmentsResult.error) return attachmentsResult
  const attachments = attachmentsResult.unwrap()

  const referencedLogResult = await findReferencedLog(
    {
      workspace,
      documentUuid: documentUuid!,
      parentMessageIds,
    },
    db,
  )

  if (referencedLogResult.error) return referencedLogResult
  const parentLog = referencedLogResult.unwrap()

  if (parentLog) {
    return await getFollowUpTriggerResponse({
      workspace,
      parentLog,
      body,
      attachments,
    })
  }

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
