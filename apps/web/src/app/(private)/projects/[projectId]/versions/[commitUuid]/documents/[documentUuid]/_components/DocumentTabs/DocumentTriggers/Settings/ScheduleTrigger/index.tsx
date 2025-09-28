import useDocumentTriggers from '$/stores/documentTriggers'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useMemo } from 'react'
import { ScheduleTriggerConfig } from './Config'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTrigger,
  DocumentVersion,
} from '@latitude-data/core/schema/types'

export function ScheduleTriggerSettings({
  document,
  projectId,
  commitUuid,
}: {
  document: DocumentVersion
  projectId: number
  commitUuid: string
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
    commitUuid,
    documentUuid: document.documentUuid,
  })
  const trigger = useMemo(
    () =>
      documentTriggers.find(
        (t) => t.triggerType === DocumentTriggerType.Scheduled,
      ) as DocumentTrigger<DocumentTriggerType.Scheduled> | undefined,
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
          documentTriggerUuid: trigger.uuid,
          configuration: config,
        })
        return
      }

      create({
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: config,
      })
    },
    [trigger, create, deleteFn, update, document.documentUuid],
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
