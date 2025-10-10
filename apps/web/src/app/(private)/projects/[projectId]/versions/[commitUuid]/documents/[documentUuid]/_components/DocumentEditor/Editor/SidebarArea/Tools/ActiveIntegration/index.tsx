import { IndentationBar } from '$/components/Sidebar/Files/IndentationBar'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Image from 'next/image'
import { useState } from 'react'
import { ToolList } from './ToolList'
import { UseActiveIntegrationsReturn } from '../hooks/useActiveIntegrations'

type ItemIcon = { type: 'icon'; name: IconProps['name'] }
type ItemImage = { type: 'image'; src: string; alt: string }

type ImageIcon = ItemIcon | ItemImage
function ImageIconComponent({ imageIcon }: { imageIcon?: ImageIcon }) {
  if (!imageIcon) return null
  if (!imageIcon?.type) return null

  if (imageIcon.type === 'image') {
    return (
      <Image src={imageIcon.src} alt={imageIcon.alt} width={16} height={16} />
    )
  }

  return <Icon name={imageIcon.name} size='normal' />
}

export type ActiveIntegrationData = {
  id: number
  name: string
  model: IntegrationDto
  icon?: ItemIcon | ItemImage
  activeTools: string[] | boolean
}

export function ActiveIntegration({
  integration,
  addIntegrationTool,
  removeIntegrationTool,
}: {
  integration: ActiveIntegrationData
  addIntegrationTool: UseActiveIntegrationsReturn['addIntegrationTool']
  removeIntegrationTool: UseActiveIntegrationsReturn['removeIntegrationTool']
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className='flex flex-col'>
      {/* Header */}
      <div className='flex items-center gap-x-1 min-w-0 min-h-7'>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className='flex items-center gap-2'
        >
          <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} />
        </button>

        <ImageIconComponent imageIcon={integration.icon} />
        <Text.H5M>{integration.name}</Text.H5M>
      </div>

      {/* Tools list */}
      {isOpen && (
        <div className='flex flex-col gap-1'>
          <ToolList
            integration={integration.model}
            activeTools={integration.activeTools}
            addIntegrationTool={addIntegrationTool}
            removeIntegrationTool={removeIntegrationTool}
          />
        </div>
      )}
    </div>
  )
}
