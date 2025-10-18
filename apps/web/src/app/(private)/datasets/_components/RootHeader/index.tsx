'use client'

import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useToggleModal } from '$/hooks/useToogleModal'

import { NewDatasetModal } from './NewDatasetModal'
import { GenerateDatasetCloudModal } from './GenerateDatasetModal'
import { useCallback } from 'react'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

export function RootDatasetHeader({
  isCloud,
  openNewDatasetModal,
  generateInput,
  openGenerateDatasetModal,
}: {
  isCloud: boolean
  generateInput: {
    parameters: string | undefined
    name: string | undefined
    backUrl: string | undefined
  }
  backUrl: string | undefined
  openNewDatasetModal: boolean
  openGenerateDatasetModal: boolean
}) {
  const navigate = useNavigate()
  const newDataset = useToggleModal({ initialState: openNewDatasetModal })
  const generateModal = useToggleModal({
    initialState: openGenerateDatasetModal,
  })
  const onOpenChange = useCallback(
    (modal: 'new' | 'generate') => (newOpen: boolean) => {
      if (modal === 'new') {
        newDataset.onOpenChange(newOpen)
      } else {
        generateModal.onOpenChange(newOpen)
      }
      if (!newOpen) {
        navigate.replace(ROUTES.datasets.root())
      }
    },
    [navigate, newDataset, generateModal],
  )
  const onOpen = useCallback(
    (modal: 'new' | 'generate') => () => {
      if (modal === 'new') {
        newDataset.onOpen()
      } else {
        generateModal.onOpen()
      }
      navigate.replace(ROUTES.datasets.root({ modal }))
    },
    [navigate, newDataset, generateModal],
  )
  return (
    <div className='flex flex-row items-center gap-2'>
      {isCloud ? (
        <TableWithHeader.Button onClick={onOpen('generate')}>
          Generate dataset
        </TableWithHeader.Button>
      ) : null}
      <TableWithHeader.Button onClick={onOpen('new')}>
        Upload dataset
      </TableWithHeader.Button>

      <NewDatasetModal
        open={newDataset.open}
        onOpenChange={onOpenChange('new')}
      />
      <GenerateDatasetCloudModal
        isCloud={isCloud}
        open={generateModal.open}
        onOpenChange={onOpenChange('generate')}
        generateInput={generateInput}
      />
    </div>
  )
}
