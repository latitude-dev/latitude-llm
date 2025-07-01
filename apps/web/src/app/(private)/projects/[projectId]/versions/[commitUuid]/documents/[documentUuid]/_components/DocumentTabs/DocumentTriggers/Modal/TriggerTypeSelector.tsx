import React, { ReactNode, useState } from 'react'
import Image from 'next/image'

import { usePipedreamApp } from '$/stores/pipedreamApp'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import {
  IntegrationDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

const SKELETON_COUNT = 3

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

function SkeletonList({ count = SKELETON_COUNT }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <OptionSkeleton key={idx} />
      ))}
    </>
  )
}

function TriggerOption({
  label,
  icon,
  description,
  isSelected,
  onClick,
  children,
}: {
  label: string
  icon?: ReactNode
  description?: ReactNode
  isSelected: boolean
  onClick?: () => void
  children?: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const handleClick = () => {
    onClick?.()
    if (children) setIsOpen((prev) => !prev)
  }

  return (
    <div className='flex flex-col'>
      <div
        className={cn('flex items-center p-2 gap-4 cursor-pointer rounded-md', {
          'bg-accent': isSelected,
          'hover:bg-muted': !isSelected,
          'bg-muted': !isSelected && isOpen,
          'sticky top-0': Boolean(children),
        })}
        onClick={handleClick}
      >
        {icon && (
          <div
            className={cn(
              'min-w-10 min-h-10 flex items-center justify-center rounded-md',
              {
                'bg-accent': !isSelected,
                'bg-background': isSelected,
              },
            )}
          >
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

function IntegrationTriggerGroup({
  integration,
  selectedComponent,
  onSelectComponent,
}: {
  integration: Extract<IntegrationDto, { type: IntegrationType.Pipedream }>
  selectedComponent?: PipedreamComponent<PipedreamComponentType.Trigger>
  onSelectComponent: (
    component: PipedreamComponent<PipedreamComponentType.Trigger>,
  ) => void
}) {
  const { data, isLoading } = usePipedreamApp(integration.configuration.appName)
  return (
    <TriggerOption
      icon={
        <Image
          src={integration.configuration.metadata!.imageUrl!}
          alt={`${integration.name} icon`}
          width={20}
          height={20}
          unoptimized
          className='rounded-md'
        />
      }
      label={integration.name}
      isSelected={Boolean(selectedComponent)}
      description={
        data ? (
          <Text.H6 wordBreak='breakWord' color='foregroundMuted'>
            {`${data.name} · ${data.triggers.length} triggers`}
          </Text.H6>
        ) : (
          <Skeleton className='w-full' height='h6' />
        )
      }
    >
      <div className='flex flex-col pl-4 gap-2'>
        {isLoading || !data ? (
          <SkeletonList />
        ) : (
          data.triggers.map((component) => (
            <TriggerOption
              key={component.key}
              label={component.name}
              description={
                <Text.H6 wordBreak='breakWord' color='foregroundMuted'>
                  {component.description}
                </Text.H6>
              }
              isSelected={selectedComponent?.key === component.key}
              onClick={() => onSelectComponent(component)}
            />
          ))
        )}
      </div>
    </TriggerOption>
  )
}

export function TriggerTypesSelector({
  integrations,
  isLoadingIntegrations,
  selectedType,
  selectedIntegration,
  selectedComponent,
  onSelect,
}: {
  integrations: IntegrationDto[]
  isLoadingIntegrations: boolean
  selectedType?: DocumentTriggerType
  selectedIntegration?: IntegrationDto
  selectedComponent?: PipedreamComponent<PipedreamComponentType.Trigger>
  onSelect: <T extends DocumentTriggerType>(
    type: T,
    integration: T extends DocumentTriggerType.Integration
      ? IntegrationDto
      : undefined,
    component: T extends DocumentTriggerType.Integration
      ? PipedreamComponent<PipedreamComponentType.Trigger>
      : undefined,
  ) => void
}) {
  return (
    <div className='flex flex-col gap-2 min-w-[400px] max-w-[400px] overflow-y-auto custom-scrollbar pb-4'>
      <TriggerOption
        icon={<Icon name='mail' color='primary' />}
        label='Email'
        description={
          <Text.H6 wordBreak='breakWord' color='foregroundMuted'>
            Run this prompt sending an email to a specific address.
          </Text.H6>
        }
        isSelected={selectedType === DocumentTriggerType.Email}
        onClick={() =>
          onSelect(DocumentTriggerType.Email, undefined, undefined)
        }
      />
      <TriggerOption
        icon={<Icon name='clock' color='primary' />}
        label='Schedule'
        description={
          <Text.H6 wordBreak='breakWord' color='foregroundMuted'>
            Automatically run this prompt on a schedule.
          </Text.H6>
        }
        isSelected={selectedType === DocumentTriggerType.Scheduled}
        onClick={() =>
          onSelect(DocumentTriggerType.Scheduled, undefined, undefined)
        }
      />
      {isLoadingIntegrations ? (
        <SkeletonList />
      ) : (
        integrations
          .filter((i) => i.type === IntegrationType.Pipedream)
          .map((integration) => (
            <IntegrationTriggerGroup
              key={integration.id}
              integration={
                integration as Extract<
                  IntegrationDto,
                  { type: IntegrationType.Pipedream }
                >
              }
              selectedComponent={
                selectedType === DocumentTriggerType.Integration &&
                selectedIntegration?.id === integration.id
                  ? selectedComponent
                  : undefined
              }
              onSelectComponent={(component) =>
                onSelect(
                  DocumentTriggerType.Integration,
                  integration,
                  component,
                )
              }
            />
          ))
      )}
    </div>
  )
}
