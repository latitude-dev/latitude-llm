import { DocumentTriggerType, LogSources } from '@latitude-data/constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentTrigger } from '../../../schema/models/types/DocumentTrigger'
import { type DocumentTriggerEvent } from '../../../schema/models/types/DocumentTriggerEvent'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import { Result, TypedResult } from '../../../lib/Result'
import {
  NotFoundError,
  NotImplementedError,
} from '@latitude-data/constants/errors'
import {
  CommitsRepository,
  DocumentTriggersRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { runDocumentAtCommit } from '../../commits'
import { BACKGROUND } from '../../../telemetry'
import { sendEmailResponse } from '../handlers/email/sendResponse'
import { AssistantMessage } from '@latitude-data/constants/messages'
import { getDocumentTriggerEventRunParameters } from './getDocumentTriggerRunParameters'

function getRunSource(
  documentTrigger: DocumentTrigger,
): TypedResult<LogSources> {
  switch (documentTrigger.triggerType) {
    case DocumentTriggerType.Email:
      return Result.ok(LogSources.EmailTrigger)
    case DocumentTriggerType.Scheduled:
      return Result.ok(LogSources.ScheduledTrigger)
    case DocumentTriggerType.Integration:
      return Result.ok(LogSources.IntegrationTrigger)
    default:
      return Result.error(
        new NotImplementedError(
          `Trigger type '${documentTrigger.triggerType}' is not implemented`,
        ),
      )
  }
}

export async function runDocumentFromTriggerEvent<
  T extends DocumentTriggerType,
>({
  workspace,
  documentTriggerEvent,
  commit,
}: {
  workspace: WorkspaceDto
  documentTriggerEvent: DocumentTriggerEvent<T>
  commit: Commit
}) {
  const effectiveCommit = await resolveEffectiveCommit({
    workspace,
    commit,
  })
  if (effectiveCommit.error) return effectiveCommit
  const resolvedCommit = effectiveCommit.unwrap()

  const documentTriggersRepository = new DocumentTriggersRepository(
    workspace.id,
  )
  const documentTriggerResult =
    await documentTriggersRepository.getTriggerByUuid({
      uuid: documentTriggerEvent.triggerUuid,
      commit: resolvedCommit,
    })
  if (!Result.isOk(documentTriggerResult)) return documentTriggerResult
  const documentTrigger = documentTriggerResult.unwrap()

  const documentsScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentsScope.getDocumentAtCommit({
    projectId: documentTrigger.projectId,
    commitUuid: resolvedCommit.uuid,
    documentUuid: documentTrigger.documentUuid,
  })
  if (!Result.isOk(documentResult)) return documentResult
  const document = documentResult.unwrap()

  const parameters = getDocumentTriggerEventRunParameters({
    documentTrigger,
    documentTriggerEvent,
  })

  if (parameters === null) {
    return Result.error(
      new NotImplementedError(
        `Trigger type '${documentTrigger.triggerType}' is not implemented`,
      ),
    )
  }

  const sourceResult = getRunSource(documentTrigger)
  if (!Result.isOk(sourceResult)) return sourceResult
  const source = sourceResult.unwrap()

  const runResult = await runDocumentAtCommit({
    context: BACKGROUND({ workspaceId: workspace.id }),
    workspace,
    document,
    parameters,
    commit: resolvedCommit,
    source,
  })

  // If the trigger is an email trigger, we need to do some post-processing (sending the response back to the user)
  if (documentTrigger.triggerType === DocumentTriggerType.Email) {
    let result: TypedResult<AssistantMessage, Error>
    if (Result.isOk(runResult)) {
      const run = runResult.unwrap()
      const messages = await run.conversation.messages
      const response = messages[messages.length - 1] as AssistantMessage
      result = Result.ok(response)
    } else {
      result = runResult
    }

    const sendResponseResult = await sendEmailResponse({
      documentTrigger:
        documentTrigger as DocumentTrigger<DocumentTriggerType.Email>,
      documentTriggerEvent:
        documentTriggerEvent as DocumentTriggerEvent<DocumentTriggerType.Email>,
      result,
    })

    if (!Result.isOk(sendResponseResult)) return sendResponseResult

    return Result.nil()
  }

  if (!Result.isOk(runResult)) return runResult

  return Result.nil()
}

async function resolveEffectiveCommit({
  workspace,
  commit,
}: {
  workspace: WorkspaceDto
  commit: Commit
}): Promise<TypedResult<Commit>> {
  if (!commit.mergedAt) return Result.ok(commit)

  const commitsRepo = new CommitsRepository(workspace.id)
  const liveCommit = await commitsRepo.getHeadCommit(commit.projectId)
  if (!liveCommit) {
    return Result.error(
      new NotFoundError(
        `Live commit not found in project ${commit.projectId}`,
      ),
    )
  }

  return Result.ok(liveCommit)
}
