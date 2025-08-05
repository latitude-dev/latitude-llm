import { useTriggersModalContext } from '../contexts/triggers-modal-context'
import {
  TwoColumnSelect,
  TwoColumnSelectOption,
} from '@latitude-data/web-ui/molecules/TwoColumnSelect'
import { useCallback, useMemo } from 'react'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'

const EMPTY_LIST: PipedreamComponent<PipedreamComponentType.Trigger>[] = []

export function TriggersList() {
  const {
    selectedPipedreamApp,
    isSelectedPipedreamAppLoading,
    selectedIntegration,
    setSelectedIntegration,
  } = useTriggersModalContext()

  const slug = selectedIntegration?.pipedream?.name_slug
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
      const trigger = triggers.find((t) => t.key === triggerKey)
      if (!trigger || !slug) return

      setSelectedIntegration({
        ...selectedIntegration,
        pipedream: {
          name_slug: slug,
          trigger,
        },
      })
    },
    [slug, triggers, setSelectedIntegration, selectedIntegration],
  )

  if (!slug) return null

  return (
    <TwoColumnSelect
      loading={isSelectedPipedreamAppLoading}
      options={options}
      onChange={onTriggerChange}
      emptySlateLabel='This integration has no triggers'
    >
      Hola que tal
    </TwoColumnSelect>
  )
}
