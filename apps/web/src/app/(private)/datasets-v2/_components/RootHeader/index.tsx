'use client'

import { TableWithHeader } from '@latitude-data/web-ui'
import { useToggleModal } from '$/hooks/useToogleModal'

import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { NewDatasetModal } from './NewDatasetModal'

export function RootDatasetHeader({ isCloud }: { isCloud: boolean }) {
  const newDataset = useToggleModal()
  return (
    <div className='flex flex-row items-center gap-2'>
      {isCloud ? (
        <Link href={ROUTES.datasetsV2.generate.root}>
          <TableWithHeader.Button>Generate dataset</TableWithHeader.Button>
        </Link>
      ) : null}
      <TableWithHeader.Button onClick={newDataset.onOpen}>
        Upload dataset
      </TableWithHeader.Button>

      <NewDatasetModal
        open={newDataset.open}
        onOpenChange={newDataset.onOpenChange}
      />
    </div>
  )
}
