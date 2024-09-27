'use client'

import { useCallback, useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { TableWithHeader, useCurrentDocument } from '@latitude-data/web-ui'

import CreateBatchEvaluationModal from './CreateBatchEvaluationModal'
import LiveEvaluationToggle from './LiveEvaluationToggle'

export function Actions({
  evaluation,
  projectId,
  commitUuid,
  documentUuid,
}: {
  evaluation: EvaluationDto
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  const document = useCurrentDocument()
  const [open, setOpen] = useState(false)
  const onClose = useCallback(() => setOpen(false), [])
  const onOpen = useCallback(() => setOpen(true), [])
  return (
    <div className='flex flex-row items-center gap-4'>
      <LiveEvaluationToggle
        documentUuid={documentUuid}
        evaluation={evaluation}
      />
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
