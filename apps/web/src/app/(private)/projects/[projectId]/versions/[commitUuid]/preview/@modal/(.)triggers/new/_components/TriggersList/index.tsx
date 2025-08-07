import {
  SearchableList,
  OptionItem,
  type OnSelectValue,
} from '@latitude-data/web-ui/molecules/SearchableList'
import { useCallback, useMemo, useState } from 'react'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { usePipedreamApp } from '$/stores/pipedreamApp'

type Trigger = PipedreamComponent<PipedreamComponentType.Trigger>
const EMPTY_LIST: Trigger[] = []

export function TriggersList({ pipedreamSlug }: { pipedreamSlug: string }) {
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
            description: trigger.name,
          }) satisfies OptionItem,
      ),
    [triggers],
  )
  const onTriggerChange: OnSelectValue = useCallback(
    (triggerKey: string) => {
      const foundTrigger = triggers.find((t) => t.key === triggerKey)
      if (!foundTrigger) return

      setTrigger(foundTrigger)
    },
    [triggers],
  )

  return (
    <div className='h-full grid grid-cols-2'>
      <div className='bg-background border-r border-border'>
        <SearchableList
          listStyle={{ listWrapper: 'onlySeparators', size: 'small' }}
          multiGroup={false}
          showSearch={false}
          loading={isLoading}
          items={options}
          selectedValue={selectedTrigger?.key}
          onSelectValue={onTriggerChange}
        />
      </div>
    </div>
  )
}
