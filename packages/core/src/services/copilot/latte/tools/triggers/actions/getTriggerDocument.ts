import { DocumentTriggerType } from '@latitude-data/constants'
import { type Commit } from '../../../../../../schema/models/types/Commit'
import { type DocumentTrigger } from '../../../../../../schema/models/types/DocumentTrigger'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { Result } from '../../../../../../lib/Result'
import { PromisedResult } from '../../../../../../lib/Transaction'
import { LatteTriggerAction } from '@latitude-data/constants/latte'
import { NotFoundError } from '@latitude-data/constants/errors'
import { DocumentTriggersRepository } from '../../../../../../repositories'

export async function getTriggerDocument(
  triggerSpecification: LatteTriggerAction,
  workspaceId: number,
  commit: Commit,
  promptUuid: string,
): PromisedResult<DocumentTrigger> {
  const documentTriggersRepository = new DocumentTriggersRepository(workspaceId)

  const documentTriggers = await documentTriggersRepository
    .getTriggersInDocument({
      documentUuid: promptUuid,
      commit,
    })
    .then((r) => r.unwrap())

  if (documentTriggers.length === 0) {
    return Result.error(
      new NotFoundError(
        `Document with UUID ${promptUuid} has no document triggers.`,
      ),
    )
  }

  if (triggerSpecification.triggerType === DocumentTriggerType.Integration) {
    const integrationTriggers = documentTriggers.filter(
      (trigger) => trigger.triggerType === DocumentTriggerType.Integration,
    )

    const integrationTrigger = integrationTriggers.find((trigger) => {
      const config = trigger.configuration as IntegrationTriggerConfiguration
      return (
        config.integrationId ===
        triggerSpecification.configuration.integrationId
      )
    })

    if (!integrationTrigger) {
      return Result.error(
        new NotFoundError(
          `Integration trigger with ID ${triggerSpecification.configuration.integrationId} not found for document with UUID ${promptUuid}.`,
        ),
      )
    }

    return Result.ok(integrationTrigger)
  }

  // For email and scheduled triggers, there can only be one per document
  const triggerOfType = documentTriggers.find(
    (trigger) => trigger.triggerType === triggerSpecification.triggerType,
  )

  if (!triggerOfType) {
    return Result.error(
      new NotFoundError(
        `${triggerSpecification.triggerType} trigger not found for document with UUID ${promptUuid}.`,
      ),
    )
  }

  return Result.ok(triggerOfType)
}
