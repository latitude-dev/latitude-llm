import {
  TwoColumnSelect,
  TwoColumnSelectOption,
} from '@latitude-data/web-ui/molecules/TwoColumnSelect'
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
  const options = useMemo<TwoColumnSelectOption<string>[]>(
    () =>
      triggers.map((trigger) => ({
        label: trigger.name,
        value: trigger.key,
        name: trigger.name,
      })),
    [triggers],
  )
  const onTriggerChange = useCallback(
    (triggerKey: string) => {
      setTrigger((prevTrigger) => {
        return triggers.find((t) => t.key === triggerKey) ?? prevTrigger
      })
    },
    [triggers],
  )

  return (
    <TwoColumnSelect
      loading={isLoading}
      options={options}
      onChange={onTriggerChange}
      emptySlateLabel='This integration has no triggers'
    >
      {selectedTrigger
        ? (JSON.stringify(selectedTrigger, null, 2) as string)
        : 'No trigger'}
    </TwoColumnSelect>
  )
}
