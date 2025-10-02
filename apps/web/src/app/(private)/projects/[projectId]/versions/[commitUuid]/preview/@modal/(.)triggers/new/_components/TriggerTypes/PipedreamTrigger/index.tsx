import {
  SearchableList,
  OptionItem,
  type OnSelectValue,
} from '@latitude-data/web-ui/molecules/SearchableList'
import { useCallback, useMemo, useState } from 'react'
import { cn } from '@latitude-data/web-ui/utils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { type OnTriggerCreated } from '../../../client'
import { TriggerConfiguration } from './TriggerConfiguration'
import {
  type PipedreamComponent,
  type PipedreamComponentType,
} from '@latitude-data/core/constants'

export type Trigger = PipedreamComponent<PipedreamComponentType.Trigger>
const EMPTY_LIST: Trigger[] = []

export function PipedreamTrigger({
  pipedreamSlug,
  onTriggerCreated,
}: {
  pipedreamSlug: string
  onTriggerCreated: OnTriggerCreated
}) {
  const [selectedTrigger, setTrigger] = useState<Trigger | null>(null)
  const { data: selectedPipedreamApp, isLoading } =
    usePipedreamApp(pipedreamSlug)

  const triggers = selectedPipedreamApp?.triggers ?? EMPTY_LIST
  const options = useMemo<OptionItem[]>(
    () =>
      triggers.map(
        (trigger) =>
          ({
            type: 'item',
            value: trigger.key,
            title: trigger.name,
            description: trigger.description ?? 'No description available',
          }) satisfies OptionItem,
      ),
    [triggers],
  )
  const onTriggerChange: OnSelectValue = useCallback(
    (triggerKey: string) => {
      const foundTrigger = triggers.find((t) => t.key === triggerKey)

      // Should not happen
      if (!foundTrigger) return

      setTrigger(foundTrigger)
    },
    [triggers],
  )

  const canConfigureTrigger = selectedTrigger && selectedPipedreamApp
  return (
    <div className='h-full grid grid-cols-2'>
      <div className='bg-background border-r border-border overflow-y-auto custom-scrollbar pb-6'>
        <SearchableList
          loading={isLoading}
          listStyle={{ listWrapper: 'onlySeparators', size: 'small' }}
          multiGroup={false}
          showSearch={false}
          items={options}
          selectedValue={selectedTrigger?.key}
          onSelectValue={onTriggerChange}
        />
      </div>
      <div
        className={cn('p-4 overflow-y-auto custom-scrollbar', {
          'bg-background': canConfigureTrigger,
        })}
      >
        {canConfigureTrigger ? (
          <TriggerConfiguration
            trigger={selectedTrigger}
            pipedreamApp={selectedPipedreamApp}
            onTriggerCreated={onTriggerCreated}
          />
        ) : (
          <div className='h-full flex items-center justify-center'>
            <Text.H6 color='foregroundMuted'>
              Select a trigger to configure it.
            </Text.H6>
          </div>
        )}
      </div>
    </div>
  )
}
