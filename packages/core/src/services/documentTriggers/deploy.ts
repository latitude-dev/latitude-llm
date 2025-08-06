import {
  BadRequestError,
  NotImplementedError,
} from '@latitude-data/constants/errors'
import { Commit, Workspace } from '../../browser'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { Result, TypedResult } from '../../lib/Result'
import { DocumentTriggerType } from '@latitude-data/constants'
import { deployIntegrationTrigger } from './deploy/integrationTrigger'
import {
  DocumentTriggerConfiguration,
  DocumentTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { deployScheduledTrigger } from './deploy/scheduleTrigger'

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
        configuration:
          configuration as DocumentTriggerConfiguration<DocumentTriggerType.Scheduled>,
      }) as TypedResult<DocumentTriggerDeploymentSettings<T>>

    case DocumentTriggerType.Email:
      // Email triggers do not require deployment, they are always ready to use.
      return Result.ok(
        {} as DocumentTriggerDeploymentSettings<DocumentTriggerType.Email>,
      ) as TypedResult<DocumentTriggerDeploymentSettings<T>>

    default:
      return Result.error(
        new NotImplementedError(
          `Trigger type '${triggerType}' is not supported for deployment.`,
        ),
      )
  }
}
