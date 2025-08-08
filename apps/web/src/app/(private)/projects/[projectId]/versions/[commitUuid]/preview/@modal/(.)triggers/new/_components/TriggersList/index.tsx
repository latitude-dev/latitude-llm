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

  return (
    <div className='bg-background h-full grid grid-cols-2'>
      <div className='border-r border-border overflow-y-auto custom-scrollbar pb-6'>
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
      <div className='p-6'>
        {selectedTrigger && selectedPipedreamApp ? (
          <TriggerConfiguration
            trigger={selectedTrigger}
            pipedreamApp={selectedPipedreamApp}
            onTriggerCreated={onTriggerCreated}
          />
        ) : null}
      </div>
    </div>
  )
}
