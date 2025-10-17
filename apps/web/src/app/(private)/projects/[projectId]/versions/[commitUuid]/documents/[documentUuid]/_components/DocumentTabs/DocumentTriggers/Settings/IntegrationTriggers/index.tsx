import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { useMemo } from 'react'
import { TriggersBlankSlate } from './BlankSlate'
import { IntegrationTriggerList } from './TriggerList'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
export function IntegrationTriggerSettings({
  document,
  projectId,
  commitUuid,
  openTriggerModal,
}: {
  document: DocumentVersion
  projectId: number
  commitUuid: string
  openTriggerModal: (
    trigger?: DocumentTrigger<DocumentTriggerType.Integration>,
  ) => void
}) {
  const { data: documentTriggers, isLoading } = useDocumentTriggers({
    projectId,
    commitUuid,
    documentUuid: document.documentUuid,
  })

  const integrationTriggers = useMemo(
    () =>
      documentTriggers.filter(
        (t) => t.triggerType === DocumentTriggerType.Integration,
      ) as DocumentTrigger<DocumentTriggerType.Integration>[],
    [documentTriggers],
  )

  return (
    <div className='flex flex-col gap-4'>
      {!integrationTriggers.length || isLoading ? (
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
