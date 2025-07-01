import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { useMemo } from 'react'
import { TriggersBlankSlate } from './BlankSlate'
import { IntegrationTriggerList } from './TriggerList'

export function IntegrationTriggerSettings({
  document,
  projectId,
  openTriggerModal,
}: {
  document: DocumentVersion
  projectId: number
  openTriggerModal: (
    trigger?: Extract<
      DocumentTrigger,
      { triggerType: DocumentTriggerType.Integration }
    >,
  ) => void
}) {
  const { data: documentTriggers, isLoading } = useDocumentTriggers({
    projectId,
    documentUuid: document.documentUuid,
  })

  const integrationTriggers = useMemo(
    () =>
      documentTriggers.filter(
        (t) => t.triggerType === DocumentTriggerType.Integration,
      ),
    [documentTriggers],
  )

  return (
    <div className='flex flex-col gap-4'>
      {!integrationTriggers || isLoading ? (
        <TriggersBlankSlate openTriggerModal={openTriggerModal} />
      ) : (
        <IntegrationTriggerList
          triggers={integrationTriggers}
          onOpenTrigger={openTriggerModal}
        />
      )}
    </div>
  )
}
