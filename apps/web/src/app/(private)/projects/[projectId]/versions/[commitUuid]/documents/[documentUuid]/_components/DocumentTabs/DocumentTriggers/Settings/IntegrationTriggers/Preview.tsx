import useIntegrations from '$/stores/integrations'
import { IntegrationType } from '@latitude-data/constants'
import type { PipedreamIntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import Image from 'next/image'
import { LatitudeLogo } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Icons/custom-icons'
import { ReactNode, useEffect, useMemo, useState } from 'react'

type ImagePreview = {
  type: 'image'
  src: string
}
type IconPreview = {
  type: 'icon'
  name: IconName
}
type IntegrationPreviewItem = ImagePreview | IconPreview

const DEFAULT_ITEMS: IntegrationPreviewItem[] = [
  {
    type: 'icon',
    name: 'notion',
  },
  {
    type: 'icon',
    name: 'slack',
  },
  {
    type: 'icon',
    name: 'reddit',
  },
  {
    type: 'icon',
    name: 'supabase',
  },
]

type CarouselProps<T> = {
  items: T[]
  renderItem: (item: T) => ReactNode
  interval?: number
  className?: string
}

export function SlidingCarousel<T>({
  items,
  renderItem,
  interval = 2000,
  className = '',
}: CarouselProps<T>) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [nextIndex, setNextIndex] = useState(1)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentIndex((i) => (i + 1) % items.length)
        setNextIndex((i) => (i + 1) % items.length)
        setIsAnimating(false)
      }, 500) // matches Tailwind's duration-500
    }, interval)
    return () => clearInterval(id)
  }, [items.length, interval])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className={`absolute inset-0 flex items-center justify-center ${
          isAnimating
            ? 'transition-transform duration-500 -translate-y-full'
            : 'translate-y-0'
        }`}
      >
        {renderItem(items[currentIndex]!)}
      </div>
      <div
        className={`absolute inset-0 flex items-center justify-center ${
          isAnimating
            ? 'transition-transform duration-500 translate-y-0'
            : 'translate-y-full'
        }`}
      >
        {renderItem(items[nextIndex]!)}
      </div>
    </div>
  )
}

function IntegrationsPreview() {
  const { data: integrations } = useIntegrations({ withTriggers: true })

  const items = useMemo<IntegrationPreviewItem[]>(() => {
    if (!integrations?.length) return DEFAULT_ITEMS
    return [
      ...(integrations?.length > 1 ? [] : DEFAULT_ITEMS),
      ...integrations
        .filter(
          (i) =>
            i.type === IntegrationType.Pipedream &&
            !!i.configuration.metadata?.imageUrl,
        )
        .map(
          (i) =>
            ({
              type: 'image',
              src: (i.configuration as PipedreamIntegrationConfiguration)
                .metadata!.imageUrl!,
            }) as ImagePreview,
        ),
    ]
  }, [integrations])

  const renderItem = (item: IntegrationPreviewItem) => {
    if (item.type === 'image') {
      return (
        <Image
          src={item.src}
          alt='Integration Preview'
          width={24}
          height={24}
          unoptimized
        />
      )
    }

    return <Icon name={item.name} size='large' color='primary' />
  }

  return (
    <SlidingCarousel
      items={items}
      renderItem={renderItem}
      className='w-12 h-12 rounded-lg bg-accent border border-primary/20'
    />
  )
}

export function TriggersPreview() {
  return (
    <div
      className={cn(
        'relative w-full max-w-[300px] p-8',
        'flex flex-row  items-center justify-center gap-4',
        'rounded-sm',
        'bg-muted',
      )}
    >
      <IntegrationsPreview />
      <Icon name='zap' color='foregroundMuted' />
      <div className='w-12 h-12 rounded-lg bg-background items-center justify-center flex'>
        <LatitudeLogo className='w-8 h-8' />
      </div>
    </div>
  )
}
