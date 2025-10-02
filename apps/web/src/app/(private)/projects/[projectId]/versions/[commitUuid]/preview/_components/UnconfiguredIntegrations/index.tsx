import { useConfigureIntegrationAccount } from '$/hooks/useConfigureIntegrationAccount'
import useDocumentIntegrationReferences from '$/stores/documentIntegrationReferences'
import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import {
  Commit,
  DocumentTrigger,
  PipedreamIntegration,
} from '@latitude-data/core/schema/types'
import { isIntegrationConfigured } from '@latitude-data/core/services/integrations/pipedream/components/fillConfiguredProps'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import Image from 'next/image'
import { useMemo } from 'react'

function useReferencedUnconfiguredIntegrations({ commit }: { commit: Commit }) {
  const { data: integrations } = useIntegrations()
  const unconfiguredIntegrations = useMemo(
    () =>
      integrations.filter(
        (integration) =>
          integration.type === IntegrationType.Pipedream &&
          !isIntegrationConfigured(integration),
      ) as PipedreamIntegration[],
    [integrations],
  )

  const { data: triggers } = useDocumentTriggers({
    projectId: commit.projectId,
    commitUuid: commit.uuid,
  })

  const { data: toolReferences } = useDocumentIntegrationReferences({
    projectId: commit.projectId,
    commitUuid: commit.uuid,
  })

  const referencedUnconfiguredIntegrations = useMemo(
    () =>
      unconfiguredIntegrations.filter((integration) => {
        const usedByTrigger = triggers?.some(
          (trigger) =>
            trigger.triggerType === DocumentTriggerType.Integration &&
            (trigger as DocumentTrigger<DocumentTriggerType.Integration>)
              .configuration.integrationId === integration.id,
        )
        if (usedByTrigger) return true

        const usedByTool = toolReferences?.some(
          (toolReference) => toolReference.integrationId === integration.id,
        )
        if (usedByTool) return true

        return false
      }),
    [unconfiguredIntegrations, triggers, toolReferences],
  )

  return useMemo(
    () => ({ referencedUnconfiguredIntegrations }),
    [referencedUnconfiguredIntegrations],
  )
}

export function UnconfiguredIntegration({
  integration,
}: {
  integration: PipedreamIntegration
}) {
  const { isLoading, connectAccount, isUpdating } =
    useConfigureIntegrationAccount({
      integration,
    })

  return (
    <div className='flex flex-row px-4 py-3 gap-3 border border-latte-border bg-latte-background rounded-xl items-center'>
      <Image
        src={integration.configuration.metadata?.imageUrl ?? ''}
        alt={integration.name}
        className='max-w-6 max-h-6'
        width={24}
        height={24}
        unoptimized
      />

      <div className='flex-1'>
        <Text.H5 color='latteOutputForeground'>
          '{integration.name}' integration needs additional configuration
        </Text.H5>
      </div>

      <Button
        fancy
        variant='outline'
        disabled={isLoading}
        onClick={connectAccount}
        isLoading={isUpdating}
      >
        Set up
      </Button>
    </div>
  )
}

export function UnconfiguredIntegrations() {
  const { commit } = useCurrentCommit()
  const { referencedUnconfiguredIntegrations } =
    useReferencedUnconfiguredIntegrations({ commit })

  if (referencedUnconfiguredIntegrations.length === 0) return null

  return (
    <div className='flex flex-col gap-2'>
      {referencedUnconfiguredIntegrations.map((integration) => (
        <UnconfiguredIntegration
          key={integration.id}
          integration={integration}
        />
      ))}
    </div>
  )
}

export function getPipedreamUnconfiguredIntegrations(
  integrations: IntegrationDto[],
) {
  return integrations.filter((integration) => {
    return (
      integration.type === IntegrationType.Pipedream &&
      !isIntegrationConfigured(integration)
    )
  })
}
