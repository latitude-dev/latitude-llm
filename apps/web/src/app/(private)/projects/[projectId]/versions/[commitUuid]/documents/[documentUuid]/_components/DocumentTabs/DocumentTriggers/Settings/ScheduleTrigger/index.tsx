import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentVersion } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useMemo } from 'react'
import { ScheduleTriggerConfig } from './Config'
import { DocumentTriggerType } from '@latitude-data/constants'

export function ScheduleTriggerSettings({
  document,
  projectId,
}: {
  document: DocumentVersion
  projectId: number
}) {
  const {
    data: documentTriggers,
    isLoading,
    create,
    isCreating,
    delete: deleteFn,
    isDeleting,
    update,
    isUpdating,
  } = useDocumentTriggers({
    projectId,
    documentUuid: document.documentUuid,
  })
  const trigger = useMemo(
    () =>
      documentTriggers.find(
        (t) => t.triggerType === DocumentTriggerType.Scheduled,
      ),
    [documentTriggers],
  )
  const onChangeConfig = useMemo(
    () => (config?: any) => {
      if (!config) {
        if (!trigger) return

        deleteFn(trigger)
        return
      }

      if (trigger) {
        update({
          documentTrigger: trigger,
          configuration: config,
        })
        return
      }

      create({
        triggerType: DocumentTriggerType.Scheduled,
        configuration: config,
      })
    },
    [trigger, create, deleteFn, update],
  )

  return (
    <div className='flex flex-col gap-4'>
      <Text.H5 color='foregroundMuted'>
        Enables running this prompt in a fixed scheduled. For example, once per
        day.
      </Text.H5>
      <ScheduleTriggerConfig
        canDestroy={!!trigger}
        onChangeConfig={onChangeConfig}
        isLoading={isLoading || isCreating || isUpdating || isDeleting}
        initialConfig={trigger?.configuration}
      />
    </div>
  )
}
