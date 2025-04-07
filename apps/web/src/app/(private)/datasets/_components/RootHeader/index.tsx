'use client'

import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useToggleModal } from '$/hooks/useToogleModal'

import NewDatasetV1Modal from '$/app/(private)/datasets/_v1DeprecatedComponents/NewDatasetModal'
import { NewDatasetModal } from './NewDatasetModal'
import { GenerateDatasetCloudModal } from './GenerateDatasetModal'
import { useCallback } from 'react'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

export function RootDatasetHeader({
  isV2,
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
  isV2: boolean
}) {
  const navigate = useNavigate()
  const newDataset = useToggleModal({ initialState: openNewDatasetModal })
  const generateModal = useToggleModal({
    initialState: openGenerateDatasetModal,
  })
  const { enabled: canNotModifyDatasets } = useFeatureFlag({
    featureFlag: 'datasetsV1ModificationBlocked',
  })
  const canNotModify = isV2 ? false : canNotModifyDatasets
  const NewModal = isV2 ? NewDatasetModal : NewDatasetV1Modal
  const onOpenChange = useCallback(
    (modal: 'new' | 'generate') => (newOpen: boolean) => {
      modal === 'new'
        ? newDataset.onOpenChange(newOpen)
        : generateModal.onOpenChange(newOpen)
      if (!newOpen) {
        navigate.replace(ROUTES.datasets.root())
      }
    },
    [navigate, newDataset.onOpenChange, generateModal.onOpenChange],
  )
  const onOpen = useCallback(
    (modal: 'new' | 'generate') => () => {
      modal === 'new' ? newDataset.onOpen() : generateModal.onOpen()
      navigate.replace(ROUTES.datasets.root({ modal }))
    },
    [navigate, newDataset.onOpen, generateModal.onOpen],
  )
  return (
    <div className='flex flex-row items-center gap-2'>
      {isCloud ? (
        <TableWithHeader.Button
          onClick={onOpen('generate')}
          disabled={canNotModify}
        >
          Generate dataset
        </TableWithHeader.Button>
      ) : null}
      <TableWithHeader.Button onClick={onOpen('new')} disabled={canNotModify}>
        Upload dataset
      </TableWithHeader.Button>

      <NewModal open={newDataset.open} onOpenChange={onOpenChange('new')} />
      <GenerateDatasetCloudModal
        isCloud={isCloud}
        open={generateModal.open}
        canNotModify={canNotModify}
        onOpenChange={onOpenChange('generate')}
        generateInput={generateInput}
      />
    </div>
  )
}
