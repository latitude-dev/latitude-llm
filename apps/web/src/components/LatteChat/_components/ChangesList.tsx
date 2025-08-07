'use client'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { ModifiedDocumentType } from '@latitude-data/constants'
import type { LatteChange } from '@latitude-data/constants/latte'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
import Link from 'next/link'

function ChangeListItem({ change }: { change: LatteChange }) {
  const path = change.current.path
  const oldPath = change.previous?.path !== change.current.path ? change.previous?.path : undefined

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
          .documents.detail({ uuid: change.current.documentUuid })[DocumentRoutes.editor].root
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
    <div className='w-full flex flex-col gap-2 border-latte-widget border-2 py-2 px-3 rounded-t-2xl'>
      <div className='w-full flex items-center justify-between'>
        <Text.H4M color='latteInputForeground' userSelect={false}>
          Changes
        </Text.H4M>
        <div className='flex items-center gap-4'>
          <Button
            variant='ghost'
            size='none'
            onClick={undoChanges}
            disabled={disabled}
            iconProps={{
              name: 'undo',
              color: 'latteInputForeground',
              className: 'flex-shrink-0 group-hover:text-latte-input-foreground/75 stroke-[1.5]',
            }}
            className='text-latte-input-foreground group-hover:text-latte-input-foreground/75 font-light'
            userSelect={false}
          >
            Undo
          </Button>
          <Button
            variant='ghost'
            size='none'
            onClick={acceptChanges}
            disabled={disabled}
            iconProps={{
              name: 'checkClean',
              color: 'latteInputForeground',
              className: 'flex-shrink-0 group-hover:text-latte-input-foreground/75',
            }}
            className='text-latte-input-foreground group-hover:text-latte-input-foreground/75'
            userSelect={false}
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
