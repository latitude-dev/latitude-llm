import {
  BadRequestError,
  NotFoundError,
  NotImplementedError,
} from '@latitude-data/constants/errors'
import type { Commit, DocumentTrigger, Workspace } from '../../browser'
import Transaction, { type PromisedResult } from '../../lib/Transaction'
import { Result, type TypedResult } from '../../lib/Result'
import { DocumentTriggerType } from '@latitude-data/constants'
import { deployIntegrationTrigger, undeployIntegrationTrigger } from './deploy/integrationTrigger'
import type {
  DocumentTriggerConfiguration,
  DocumentTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { deployScheduledTrigger } from './deploy/scheduleTrigger'
import { documentTriggers } from '../../schema'
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
  }: {
    workspace: Workspace
    commit: Commit
    triggerUuid: string
    triggerType: T
    configuration: DocumentTriggerConfiguration<T>
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTriggerDeploymentSettings<T>> {
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
      ) as PromisedResult<DocumentTriggerDeploymentSettings<T>> // Typescript doesn't infer the type correctly with generics T-T

    case DocumentTriggerType.Scheduled:
      return deployScheduledTrigger({
        configuration: configuration as DocumentTriggerConfiguration<DocumentTriggerType.Scheduled>,
      }) as TypedResult<DocumentTriggerDeploymentSettings<T>>

    case DocumentTriggerType.Email:
      // Email triggers do not require deployment, they are always ready to use.
      return Result.ok(
        {} as DocumentTriggerDeploymentSettings<DocumentTriggerType.Email>,
      ) as TypedResult<DocumentTriggerDeploymentSettings<T>>

    default:
      return Result.error(
        new NotImplementedError(`Trigger type '${triggerType}' is not supported for deployment.`),
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

  switch (documentTrigger.triggerType) {
    case DocumentTriggerType.Integration:
      undeployResult = await undeployIntegrationTrigger(
        {
          workspace,
          documentTrigger: documentTrigger as DocumentTrigger<DocumentTriggerType.Integration>,
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
      })
      .where(eq(documentTriggers.id, documentTrigger.id))
      .returning()

    if (result.length === 0) {
      return Result.error(new NotFoundError('Document trigger not found'))
    }

    return Result.ok(result[0]! as DocumentTrigger<T>)
  })
}
