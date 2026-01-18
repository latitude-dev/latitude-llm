import { ActiveIntegrationType } from '@latitude-data/constants'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { IconProps } from '@latitude-data/web-ui/atoms/Icons'

type ItemIcon = { type: 'icon'; name: IconProps['name'] }
type ItemImage = { type: 'image'; src: string; alt: string }

export type ImageIcon = ItemIcon | ItemImage

export type ClientToolMetadata = {
  description?: string
  parameters?: Record<string, unknown> // Store raw parameter schema
}

export type ActiveIntegration = {
  id: number
  name: string
  icon: ImageIcon
  type: ActiveIntegrationType
  configuration: IntegrationDto['configuration']
  tools: boolean | string[]
  allToolNames: string[]
  isOpen: boolean
  // Metadata for client tools - maps tool name to its metadata
  clientToolsMetadata?: Record<string, ClientToolMetadata>
}
export type ActiveIntegrations = {
  [key: string]: ActiveIntegration
}
