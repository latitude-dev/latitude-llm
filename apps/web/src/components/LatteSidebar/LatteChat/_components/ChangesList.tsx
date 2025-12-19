'use client'
import { LatteThreadCheckpoint } from '@latitude-data/core/schema/models/types/LatteThreadCheckpoint'

import { DocumentRoutes, ROUTES } from '$/services/routes'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { ModifiedDocumentType } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import Link from 'next/link'

function ChangeListItem({ checkpoint }: { checkpoint: LatteThreadCheckpoint }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: document } = useDocumentVersion({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: checkpoint.documentUuid,
  })
  const current = document
  const previous = checkpoint.data

  if (!current) return null

  const path = current.path
  const oldPath = previous?.path !== current.path ? previous?.path : undefined

  const changeType: ModifiedDocumentType =
    previous === null
      ? ModifiedDocumentType.Created
      : current.deletedAt
        ? ModifiedDocumentType.Deleted
        : current.path !== previous?.path
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
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: current.documentUuid })[
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
  checkpoints,
  undoChanges,
  acceptChanges,
  disabled,
}: {
  checkpoints: LatteThreadCheckpoint[]
  undoChanges: () => void
  acceptChanges: () => void
  disabled?: boolean
}) {
  if (!checkpoints.length) return null

  return (
    <div className='w-full flex flex-col gap-2 py-2 px-3 border-b border-latte-widget'>
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
              className: 'flex-shrink-0 stroke-[1.5]',
            }}
            userSelect={false}
            textColor='latteInputForeground'
          >
            Undo all
          </Button>
          <Button
            variant='ghost'
            size='none'
            onClick={acceptChanges}
            disabled={disabled}
            iconProps={{
              name: 'checkClean',
              color: 'latteInputForeground',
              className: 'flex-shrink-0',
            }}
            userSelect={false}
            textColor='latteInputForeground'
          >
            Keep all
          </Button>
        </div>
      </div>
      <div className='w-full max-h-96 overflow-y-auto custom-scrollbar flex flex-col gap-1'>
        {checkpoints.map((checkpoint, index) => (
          <ChangeListItem key={index} checkpoint={checkpoint} />
        ))}
      </div>
    </div>
  )
}
