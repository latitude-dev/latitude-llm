import { IndentationBar } from '$/components/Sidebar/Files/IndentationBar'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Image from 'next/image'
import { useState } from 'react'

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
  icon?: ItemIcon | ItemImage
  tools?: string[] | boolean
}

const FAKE_TOOLS = Array.from({ length: 4 }).map((_, i) => `Tool ${i + 1}`)

export function ActiveIntegration({
  integration,
}: {
  integration: ActiveIntegrationData
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
          {FAKE_TOOLS.map((tool, index) => (
            <div key={index} className='flex items-center justify-between h-6'>
              <div className='flex items-center gap-2'>
                <IndentationBar
                  startOnIndex={0}
                  hasChildren={false}
                  indentation={[{ isLast: index === FAKE_TOOLS.length - 1 }]}
                />
                <Text.H5>{tool}</Text.H5>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
