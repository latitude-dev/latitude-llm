import { type DocumentTrigger } from '../../schema/models/types/DocumentTrigger'
import { type DocumentTriggerEvent } from '../../schema/models/types/DocumentTriggerEvent'
import { database } from '../../client'
import { documentTriggerEvents } from '../../schema/models/documentTriggerEvents'
import { createProject } from './createProject'

export async function createDocumentTriggerEventBase({
  workspaceId,
  commitId,
  trigger,
  payload,
  documentLogUuid,
}: {
  workspaceId?: number
  commitId?: number
  trigger: DocumentTrigger
  payload: Record<string, unknown>
  documentLogUuid?: string | null
}): Promise<DocumentTriggerEvent> {
  // Create project if not provided
  if (!commitId || !workspaceId) {
    const { project, commit } = await createProject()
    workspaceId = project.workspaceId
    commitId = commit.id
  }

  const [event] = await database
    .insert(documentTriggerEvents)
    .values({
      workspaceId,
      triggerUuid: trigger.uuid,
      triggerType: trigger.triggerType,
      triggerHash: trigger.triggerHash,
      payload,
      documentLogUuid: documentLogUuid || null,
    })
    .returning()

  return event as DocumentTriggerEvent
}
