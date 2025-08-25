import { DocumentTriggerType } from '@latitude-data/constants'
import type { PipedreamIntegrationWithCounts } from '@latitude-data/core/browser'
import type { OptionItem as SearchableOptionItem } from '@latitude-data/web-ui/molecules/SearchableList'
import type { TriggerIntegrationType } from '../../client'

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function connectedPipedreamAppDescription(integration: PipedreamIntegrationWithCounts): string {
  const accounts = pluralize(integration.accountCount, 'account', 'accounts')
  const triggers = pluralize(integration.triggerCount, 'trigger', 'triggers')
  return `${accounts} · ${triggers}`
}

function integrationLogo(
  integration: PipedreamIntegrationWithCounts,
): { type: 'image'; src: string; alt: string } | undefined {
  const imageUrl = integration.configuration?.metadata?.imageUrl
  if (!imageUrl) return undefined

  return {
    type: 'image',
    src: imageUrl,
    alt: integration.configuration?.metadata?.displayName ?? integration.configuration.appName,
  }
}

export function buildIntegrationOption(
  integration: PipedreamIntegrationWithCounts,
): SearchableOptionItem<TriggerIntegrationType> {
  const title = integration.configuration.metadata?.displayName ?? integration.configuration.appName

  return {
    type: 'item',
    value: integration.configuration.appName, // Slug
    title,
    keywords: [title],
    metadata: { type: DocumentTriggerType.Integration },
    description: connectedPipedreamAppDescription(integration),
    imageIcon: integrationLogo(integration),
  } satisfies SearchableOptionItem<TriggerIntegrationType>
}
