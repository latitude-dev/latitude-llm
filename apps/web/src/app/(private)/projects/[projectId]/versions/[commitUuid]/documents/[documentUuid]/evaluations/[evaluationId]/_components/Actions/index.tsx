'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useToggleModal } from '$/hooks/useToogleModal'
import { EvaluationDto } from '@latitude-data/core/browser'
import { Label, TableWithHeader } from '@latitude-data/web-ui'

import DefaultProviderBanner from '../DefaulProviderBanner'
import CreateBatchEvaluationModal from './CreateBatchEvaluationModal'
import LiveEvaluationToggle from './LiveEvaluationToggle'
import { useEffect } from 'react'
import { useMetadata } from '$/hooks/useMetadata'

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
  const { metadata, runReadMetadata } = useMetadata()
  useEffect(() => {
    runReadMetadata({
      prompt: document.content ?? '',
      fullPath: document.path,
      promptlVersion: document.promptlVersion,
    })
  }, [])
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
        evaluation={evaluation}
        projectId={projectId}
        commitUuid={commitUuid}
        documentMetadata={metadata}
      />
    </div>
  )
}
