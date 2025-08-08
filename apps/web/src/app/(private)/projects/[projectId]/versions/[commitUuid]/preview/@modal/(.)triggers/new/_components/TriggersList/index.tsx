import {
  SearchableList,
  OptionItem,
  type OnSelectValue,
} from '@latitude-data/web-ui/molecules/SearchableList'
import { useCallback, useMemo, useState } from 'react'
import type {
  DocumentTrigger,
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { TriggerConfiguration } from './TriggerConfiguration'

export type Trigger = PipedreamComponent<PipedreamComponentType.Trigger>
const EMPTY_LIST: Trigger[] = []

/**
 * This triggers are Pipedream triggers ONLY.
 */
export function TriggersList({
  pipedreamSlug,
  onTriggerCreated,
}: {
  pipedreamSlug: string
  onTriggerCreated: (documentTrigger: DocumentTrigger) => void
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
  const isFormVisible = !!selectedTrigger

  const goBackToTriggerList = useCallback(() => {
    setTrigger(null)
  }, [])

  return (
    <div className='h-full relative overflow-hidden'>
      <div
        className={cn(
          'h-full flex transition-transform duration-300 ease-in-out',
          {
            'translate-x-0': !isFormVisible,
            '-translate-x-1/2': isFormVisible,
          },
        )}
        style={{ width: '200%' }}
      >
        <div className='w-1/2 h-full grid grid-cols-2'>
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
          <div className='p-6 flex items-center justify-center'>
            <Text.H6 color='foregroundMuted'>
              Select a trigger to configure it.
            </Text.H6>
          </div>
        </div>

        <div className='w-1/2 h-full bg-background overflow-y-auto custom-scrollbar p-4'>
          {canConfigureTrigger && (
            <TriggerConfiguration
              trigger={selectedTrigger}
              pipedreamApp={selectedPipedreamApp}
              onTriggerCreated={onTriggerCreated}
              onBack={goBackToTriggerList}
            />
          )}
        </div>
      </div>
    </div>
  )
}
