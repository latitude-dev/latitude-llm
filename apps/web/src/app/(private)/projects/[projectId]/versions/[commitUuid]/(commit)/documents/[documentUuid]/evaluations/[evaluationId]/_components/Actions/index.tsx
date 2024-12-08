'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import { TableWithHeader } from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useToggleModal } from '$/hooks/useToogleModal'

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
        <LiveEvaluationToggle
          documentUuid={documentUuid}
          evaluation={evaluation}
        />
      </div>
      <TableWithHeader.Button onClick={onOpen}>
        Run batch evaluation
      </TableWithHeader.Button>
      <CreateBatchEvaluationModal
        open={open}
        onClose={onClose}
        document={document}
        evaluation={evaluation}
        projectId={projectId}
        commitUuid={commitUuid}
      />
    </div>
  )
}
