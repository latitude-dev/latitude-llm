import { LatitudeError } from '@latitude-data/constants/errors'
import { Commit, DocumentTrigger, IntegrationDto } from '../../browser'
import { PromisedResult } from '../../lib/Transaction'
import {
  CommitsRepository,
  DocumentTriggersRepository,
} from '../../repositories'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  DocumentTriggerType,
  IntegrationReference,
} from '@latitude-data/constants'

async function findCommitsByTrigger(
  {
    triggers,
    workspaceId,
  }: {
    workspaceId: number
    triggers: DocumentTrigger[]
  },
  db = database,
): Promise<Map<number, Commit>> {
  const commitsScope = new CommitsRepository(workspaceId, db)
  const commitIds = triggers.map((t) => t.commitId)
  const commits = await commitsScope.getCommitsByIds(commitIds)

  // Create a Map of trigger.id -> Commit
  const triggerToCommitMap = new Map<number, Commit>()

  for (const trigger of triggers) {
    const commit = commits.find((c: Commit) => c.id === trigger.commitId)
    if (commit) {
      triggerToCommitMap.set(trigger.id, commit)
    }
  }

  return triggerToCommitMap
}

export async function listReferences(
  integration: IntegrationDto,
  db = database,
): PromisedResult<IntegrationReference[], LatitudeError> {
  const workspaceId = integration.workspaceId
  const triggersScope = new DocumentTriggersRepository(workspaceId, db)

  const triggersResult = await triggersScope.getAllTriggers()

  if (!Result.isOk(triggersResult)) return triggersResult

  const triggers = triggersResult.unwrap()
  const references = triggers.filter(
    (trigger) =>
      trigger.triggerType === DocumentTriggerType.Integration &&
      (trigger as DocumentTrigger<DocumentTriggerType.Integration>)
        .configuration.integrationId === integration.id,
  )

  // Get commits for all triggers to include commitUuid in references
  const triggerToCommitMap = await findCommitsByTrigger(
    {
      triggers: references,
      workspaceId,
    },
    db,
  )

  return Result.ok(
    references.map((trigger) => {
      const commit = triggerToCommitMap.get(trigger.id)
      trigger
      return {
        type: 'trigger',
        data: {
          projectId: trigger.projectId,
          documentUuid: trigger.documentUuid,
          commitUuid: commit!.uuid,
          triggerUuid: trigger.uuid,
        },
      }
    }),
  )
}
