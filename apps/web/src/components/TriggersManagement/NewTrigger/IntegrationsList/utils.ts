import { DocumentTriggerType } from '@latitude-data/constants'
import { PipedreamIntegration } from '@latitude-data/core/schema/models/types/Integration'
import { OptionItem as SearchableOptionItem } from '@latitude-data/web-ui/molecules/SearchableList'

export function pluralize(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export type GroupedIntegration = {
  integration: PipedreamIntegration
  accountCount: number
  allIntegrations: PipedreamIntegration[]
}

function connectedPipedreamAppDescription(grouped: GroupedIntegration): string {
  return pluralize(grouped.accountCount, 'account', 'accounts')
}

function integrationLogo(
  integration: PipedreamIntegration,
): { type: 'image'; src: string; alt: string } | undefined {
  const imageUrl = integration.configuration?.metadata?.imageUrl
  if (!imageUrl) return undefined

  return {
    type: 'image',
    src: imageUrl,
    alt:
      integration.configuration?.metadata?.displayName ??
      integration.configuration.appName,
  }
}

export function buildIntegrationOption(
  grouped: GroupedIntegration,
): SearchableOptionItem<DocumentTriggerType> {
  const title =
    grouped.integration.configuration.metadata?.displayName ??
    grouped.integration.configuration.appName

  return {
    type: 'item',
    value: grouped.integration.configuration.appName, // Slug
    title,
    keywords: [title],
    metadata: { type: DocumentTriggerType.Integration },
    description: connectedPipedreamAppDescription(grouped),
    imageIcon: integrationLogo(grouped.integration),
  } satisfies SearchableOptionItem<DocumentTriggerType>
}
