import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { IntegrationType } from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/constants'

const SKELETON_COUNT = 3

export function TriggerTypeSelector({
  integrations,
  isLoading,
  selectedIntegration,
  selectedComponent,
  onSelect,
  disabled,
}: {
  integrations: IntegrationDto[]
  isLoading: boolean
  selectedIntegration?: IntegrationDto
  selectedComponent?: PipedreamComponent<PipedreamComponentType.Trigger>
  onSelect: (
    integration: IntegrationDto,
    component: PipedreamComponent<PipedreamComponentType.Trigger>,
  ) => void
  disabled?: boolean
}) {
  if (isLoading) {
    return <SkeletonList />
  }

  return (
    <div className='flex flex-col w-96 pb-4 overflow-y-auto custom-scrollbar'>
      {integrations
        .filter((i) => i.type === IntegrationType.Pipedream)
        .map((integration) => (
          <IntegrationTriggerGroup
            key={integration.id}
            integration={integration as any}
            isSelected={selectedIntegration?.id === integration.id}
            selectedComponentKey={selectedComponent?.key}
            onSelectComponent={(c) => onSelect(integration, c)}
            disabled={disabled}
          />
        ))}
    </div>
  )
}

function SkeletonList() {
  return (
    <>
      {Array.from({ length: SKELETON_COUNT }).map((_, idx) => (
        <OptionSkeleton key={idx} />
      ))}
    </>
  )
}

function OptionSkeleton() {
  return (
    <div className='flex items-center p-4 gap-2'>
      <Skeleton className='w-6 h-6' />
      <div className='flex flex-col gap-2'>
        <Skeleton className='w-24' height='h5' />
        <Skeleton className='w-32' height='h6' />
      </div>
    </div>
  )
}

function IntegrationTriggerGroup({
  integration,
  isSelected,
  selectedComponentKey,
  onSelectComponent,
  disabled,
}: {
  integration: Extract<IntegrationDto, { type: IntegrationType.Pipedream }>
  isSelected: boolean
  selectedComponentKey?: string
  onSelectComponent: (
    c: PipedreamComponent<PipedreamComponentType.Trigger>,
  ) => void
  disabled?: boolean
}) {
  const { data, isLoading } = usePipedreamApp(integration.configuration.appName)

  return (
    <TriggerOption
      icon={
        <Image
          src={integration.configuration.metadata!.imageUrl!}
          alt={integration.name}
          width={20}
          height={20}
          unoptimized
          className='rounded-md'
        />
      }
      label={integration.name}
      description={
        data ? (
          <Text.H6 color='foregroundMuted'>
            {`${data.name} · ${data.triggers.length} triggers`}
          </Text.H6>
        ) : (
          <Skeleton className='w-full' height='h6' />
        )
      }
      isSelected={isSelected}
      initialOpen={isSelected}
    >
      <div className='flex flex-col pl-4 gap-2'>
        {isLoading || !data ? (
          <SkeletonList />
        ) : (
          data.triggers.map((comp) => (
            <TriggerOption
              key={comp.key}
              label={comp.name}
              description={
                <Text.H6 color='foregroundMuted'>{comp.description}</Text.H6>
              }
              isSelected={selectedComponentKey === comp.key}
              disabled={disabled}
              onClick={() => onSelectComponent(comp)}
            />
          ))
        )}
      </div>
    </TriggerOption>
  )
}

function TriggerOption({
  label,
  icon,
  description,
  isSelected,
  onClick,
  initialOpen = false,
  disabled,
  children,
}: {
  label: string
  icon?: React.ReactNode
  description?: React.ReactNode
  isSelected: boolean
  onClick?: () => void
  initialOpen?: boolean
  disabled?: boolean
  children?: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  useEffect(() => {
    setIsOpen(initialOpen)
  }, [initialOpen])

  const handleClick = () => {
    if (disabled) return
    onClick?.()
    if (children) setIsOpen((o) => !o)
  }

  return (
    <div className='flex flex-col'>
      <div
        className={cn('flex items-center p-2 gap-4 rounded-md', {
          'cursor-pointer': !disabled,
          'bg-accent': isSelected,
          'hover:bg-muted': !disabled && !isSelected,
          'bg-muted': !isSelected && isOpen,
          'sticky top-0': Boolean(children),
        })}
        onClick={handleClick}
      >
        {icon && (
          <div className='min-w-10 min-h-10 flex items-center justify-center rounded-md'>
            {icon}
          </div>
        )}
        <div className='flex flex-col gap-1 overflow-hidden'>
          <Text.H5 wordBreak='breakWord'>{label}</Text.H5>
          {description}
        </div>
        {children && (
          <Icon
            name='chevronDown'
            color='foregroundMuted'
            className={cn('ml-auto transition-transform', {
              'rotate-180': isOpen,
            })}
          />
        )}
      </div>
      {children && isOpen && (
        <div className='flex pl-6 gap-2 max-w-full'>
          <div
            className={cn('min-w-1 rounded-full rounded-t-none', {
              'bg-accent': isSelected,
              'bg-muted': !isSelected,
            })}
          />
          <div className='flex flex-col gap-2 pt-2 flex-grow min-w-0'>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
