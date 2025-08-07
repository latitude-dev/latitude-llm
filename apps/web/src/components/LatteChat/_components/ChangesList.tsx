'use client'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { ModifiedDocumentType } from '@latitude-data/constants'
import { LatteChange } from '@latitude-data/constants/latte'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
import Link from 'next/link'

function ChangeListItem({ change }: { change: LatteChange }) {
  const path = change.current.path
  const oldPath =
    change.previous?.path !== change.current.path
      ? change.previous?.path
      : undefined

  const changeType: ModifiedDocumentType =
    change.previous === null
      ? ModifiedDocumentType.Created
      : change.current.deletedAt
        ? ModifiedDocumentType.Deleted
        : change.current.path !== change.previous?.path
          ? ModifiedDocumentType.UpdatedPath
          : ModifiedDocumentType.Updated

  if (changeType === ModifiedDocumentType.Deleted) {
    return (
      <DocumentChange
        path={path}
        changeType={changeType}
        isSelected={false}
        oldPath={oldPath}
        hoverBgColor='bg-latte-input'
      />
    )
  }

  return (
    <Link
      href={
        ROUTES.projects
          .detail({ id: change.projectId })
          .commits.detail({ uuid: change.draftUuid })
          .documents.detail({ uuid: change.current.documentUuid })[
          DocumentRoutes.editor
        ].root
      }
      className='w-full'
    >
      <DocumentChange
        path={path}
        changeType={changeType}
        isSelected={false}
        oldPath={oldPath}
        hoverBgColor='bg-latte-input'
      />
    </Link>
  )
}

export function ChangeList({
  changes,
  undoChanges,
  acceptChanges,
  disabled,
}: {
  changes: LatteChange[]
  undoChanges: () => void
  acceptChanges: () => void
  disabled?: boolean
}) {
  if (!changes.length) {
    return null
  }

  return (
    <div className='w-full flex flex-col gap-2 border border-input p-2 rounded-t-md'>
      <div className='w-full flex items-center justify-between'>
        <Text.H4>Changes</Text.H4>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            onClick={undoChanges}
            disabled={disabled}
            fancy
            iconProps={{
              name: 'undo',
              color: 'latteInputForeground',
            }}
          >
            Undo
          </Button>
          <Button
            variant='latte'
            onClick={acceptChanges}
            disabled={disabled}
            fancy
            iconProps={{
              name: 'check',
              color: 'latteInputForeground',
            }}
          >
            Accept
          </Button>
        </div>
      </div>
      <div className='w-full max-h-96 overflow-y-auto custom-scrollbar flex flex-col gap-1'>
        {changes.map((change, index) => (
          <ChangeListItem key={index} change={change} />
        ))}
      </div>
    </div>
  )
}
