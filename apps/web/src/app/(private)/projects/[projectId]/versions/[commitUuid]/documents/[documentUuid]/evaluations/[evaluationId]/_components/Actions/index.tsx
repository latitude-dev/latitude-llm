'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useToggleModal } from '$/hooks/useToogleModal'
import { EvaluationDto } from '@latitude-data/core/browser'
import { Label, TableWithHeader } from '@latitude-data/web-ui'
import DefaultProviderBanner from '../DefaulProviderBanner'
import CreateBatchEvaluationModal from './CreateBatchEvaluationModal'
import LiveEvaluationToggle from './LiveEvaluationToggle'

export function Actions({
  evaluation,
  projectId,
  commitUuid,
  documentUuid,
  isUsingDefaultProvider,
}: {
  evaluation: EvaluationDto
  projectId: string
  commitUuid: string
  documentUuid: string
  isUsingDefaultProvider?: boolean
}) {
  const { document } = useCurrentDocument()
  const { open, onClose, onOpen } = useToggleModal()

  return (
    <div className='flex flex-row items-center gap-4'>
      <div className='flex flex-row items-center gap-4'>
        {isUsingDefaultProvider && <DefaultProviderBanner />}
        <div className='flex flex-row gap-2 items-center'>
          <Label>Evaluate live logs</Label>
          <LiveEvaluationToggle
            documentUuid={documentUuid}
            evaluation={evaluation}
          />
        </div>
      </div>
      <TableWithHeader.Button onClick={onOpen}>
        Run batch evaluation
      </TableWithHeader.Button>
      <CreateBatchEvaluationModal
        open={open}
        onClose={onClose}
        document={document}
        evaluation={{ ...evaluation, version: 'v1' }}
        projectId={projectId}
        commitUuid={commitUuid}
      />
    </div>
  )
}
