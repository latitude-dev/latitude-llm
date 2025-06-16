'use client'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { LatteThreadChanges } from '@latitude-data/constants/latte'
import { ChangedDocument } from '@latitude-data/constants'
import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
import Link from 'next/link'
import { DocumentRoutes, ROUTES } from '$/services/routes'

function ChangeListItem({
  projectId,
  commitUuid,
  change,
}: {
  projectId: number
  commitUuid: string
  change: ChangedDocument
}) {
  return (
    <Link
      href={
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: change.documentUuid })[
          DocumentRoutes.editor
        ].root
      }
    >
      <DocumentChange
        path={change.path}
        changeType={change.changeType}
        isSelected={false}
      />
    </Link>
  )
}

function ChangeListGroup({
  projectId,
  commitUuid,
  changes,
}: {
  projectId: number
  commitUuid: string
  changes: ChangedDocument[]
}) {
  return (
    <div className='w-full flex flex-col gap-1'>
      {changes.map((change) => (
        <ChangeListItem
          key={change.documentUuid}
          projectId={projectId}
          commitUuid={commitUuid}
          change={change}
        />
      ))}
    </div>
  )
}

export function ChangeList({
  changes,
  undoChanges,
  acceptChanges,
  disabled,
}: {
  changes: LatteThreadChanges[]
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
              color: 'foregroundMuted',
            }}
          >
            Undo
          </Button>
          <Button
            variant='default'
            onClick={acceptChanges}
            disabled={disabled}
            fancy
            iconProps={{
              name: 'check',
              color: 'background',
            }}
          >
            Accept
          </Button>
        </div>
      </div>
      <div className='w-full max-h-96 overflow-y-auto custom-scrollbar flex flex-col gap-1'>
        {changes.map((changeGroup, index) => (
          <ChangeListGroup
            key={index}
            projectId={changeGroup.projectId}
            commitUuid={changeGroup.commitUuid}
            changes={changeGroup.changes}
          />
        ))}
      </div>
    </div>
  )
}
