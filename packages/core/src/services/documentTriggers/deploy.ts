import {
  BadRequestError,
  NotFoundError,
  NotImplementedError,
} from '@latitude-data/constants/errors'
import { Commit, DocumentTrigger, Workspace } from '../../schema/types'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { Result, TypedResult } from '../../lib/Result'
import {
  DocumentTriggerStatus,
  DocumentTriggerType,
} from '@latitude-data/constants'
import {
  deployIntegrationTrigger,
  undeployIntegrationTrigger,
} from './deploy/integrationTrigger'
import {
  DocumentTriggerConfiguration,
  DocumentTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { deployScheduledTrigger } from './deploy/scheduleTrigger'
import { documentTriggers } from '../../schema/models/documentTriggers'
import { eq } from 'drizzle-orm'

/**
 * Important Note:
 * This service may fetch data from an external service.
 * Do not include this service inside a transaction.
 */
export async function deployDocumentTrigger<T extends DocumentTriggerType>(
  {
    workspace,
    commit,
    triggerUuid,
    triggerType,
    configuration,
    skipDeployment = false,
  }: {
    workspace: Workspace
    commit: Commit
    triggerUuid: string
    triggerType: T
    configuration: DocumentTriggerConfiguration<T>
    skipDeployment?: boolean
  },
  transaction = new Transaction(),
): PromisedResult<{
  deploymentSettings: DocumentTriggerDeploymentSettings<T>
  triggerStatus: DocumentTriggerStatus
}> {
  if (skipDeployment) {
    return Result.ok({
      deploymentSettings: {} as DocumentTriggerDeploymentSettings<T>,
      triggerStatus: DocumentTriggerStatus.Pending,
    })
  }

  if (commit.mergedAt) {
    return Result.error(
      new BadRequestError(
        'Cannot deploy a document trigger in a merged commit. It should already have been deployed in the commit it was created in.',
      ),
    )
  }

  switch (triggerType) {
    case DocumentTriggerType.Integration:
      return deployIntegrationTrigger(
        {
          workspace,
          triggerUuid,
          commit,
          configuration:
            configuration as DocumentTriggerConfiguration<DocumentTriggerType.Integration>,
        },
        transaction,
      ) as PromisedResult<{
        deploymentSettings: DocumentTriggerDeploymentSettings<T>
        triggerStatus: DocumentTriggerStatus
      }> // Typescript doesn't infer the type correctly with generics T-T

    case DocumentTriggerType.Scheduled:
      return deployScheduledTrigger({
        configuration:
          configuration as DocumentTriggerConfiguration<DocumentTriggerType.Scheduled>,
      }) as TypedResult<{
        deploymentSettings: DocumentTriggerDeploymentSettings<T>
        triggerStatus: DocumentTriggerStatus
      }>

    case DocumentTriggerType.Email:
      // Email triggers do not require deployment, they are always ready to use.
      return Result.ok({
        deploymentSettings: {} as DocumentTriggerDeploymentSettings<T>,
        triggerStatus: DocumentTriggerStatus.Deployed,
      })

    default:
      return Result.error(
        new NotImplementedError(
          `Trigger type '${triggerType}' is not supported for deployment.`,
        ),
      )
  }
}

/**
 * Important Note:
 * This service may fetch data from an external service.
 * Do not include this service inside a transaction.
 */
export async function undeployDocumentTrigger<T extends DocumentTriggerType>(
  {
    workspace,
    documentTrigger,
  }: {
    workspace: Workspace
    documentTrigger: DocumentTrigger<T>
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTrigger<T>> {
  let undeployResult: TypedResult<undefined>

  if (documentTrigger.triggerStatus !== DocumentTriggerStatus.Deployed) {
    // Trigger is already not deployed, nothing to do
    return Result.ok(documentTrigger)
  }

  switch (documentTrigger.triggerType) {
    case DocumentTriggerType.Integration:
      undeployResult = await undeployIntegrationTrigger(
        {
          workspace,
          documentTrigger:
            documentTrigger as DocumentTrigger<DocumentTriggerType.Integration>,
        },
        transaction,
      )
      break

    case DocumentTriggerType.Scheduled:
    case DocumentTriggerType.Email:
      // No special undeploy logic for these triggers
      undeployResult = Result.ok(undefined)
      break

    default:
      undeployResult = Result.error(
        new NotImplementedError(
          `Trigger type '${documentTrigger.triggerType}' is not supported for undeployment.`,
        ),
      )
  }

  if (!Result.isOk(undeployResult)) return undeployResult

  return await transaction.call(async (tx) => {
    const result = await tx
      .update(documentTriggers)
      .set({
        deploymentSettings: null,
        triggerStatus: DocumentTriggerStatus.Deprecated,
      })
      .where(eq(documentTriggers.id, documentTrigger.id))
      .returning()

    if (result.length === 0) {
      return Result.error(new NotFoundError('Document trigger not found'))
    }

    return Result.ok(result[0]! as DocumentTrigger<T>)
  })
}
