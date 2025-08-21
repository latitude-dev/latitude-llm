import { useMemo, useState } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'

const TYPE_NAMES: Record<DocumentTrigger['triggerType'], string> = {
  [DocumentTriggerType.Scheduled]: 'Scheduled',
  [DocumentTriggerType.Email]: 'Email',
  [DocumentTriggerType.Integration]: 'Integration',
}

export function DeleteTriggerBanner({
  trigger,
  document,
  onCloseModal,
}: {
  trigger: DocumentTrigger
  document: DocumentVersion
  onCloseModal: () => void
}) {
  const documentName = useMemo(
    () => document.path.split('/').pop() || 'this document',
    [document],
  )
  const triggerTypeName = TYPE_NAMES[trigger.triggerType] || 'Trigger'
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [isDeleteExpanded, setIsDeleteExpanded] = useState(false)
  const { delete: deleteTrigger, isDeleting } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
    },
    {
      onDeleted: () => {
        onCloseModal()
      },
    },
  )
  return (
    <div
      className={cn('border rounded-md p-4', {
        'border-muted': !isDeleteExpanded,
        'border-destructive/20': isDeleteExpanded,
      })}
    >
      {isDeleteExpanded ? (
        <div className='flex flex-col gap-4'>
          <Text.H4M>Are you sure you want to delete this trigger?</Text.H4M>
          <div className='flex justify-end gap-x-4'>
            <Button
              variant='outline'
              onClick={() => setIsDeleteExpanded(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={isDeleting}
              variant='destructive'
              onClick={() => deleteTrigger(trigger)}
            >
              {isDeleting ? 'Deleting...' : 'Delete Trigger'}
            </Button>
          </div>
        </div>
      ) : (
        <Text.H5>
          <p className='pb-2'>
            This <strong>{triggerTypeName}</strong> trigger is used in{' '}
            <strong>{documentName}</strong> prompt.
          </p>
          You can{' '}
          <button onClick={() => setIsDeleteExpanded(true)}>
            <Text.H5 underline color='destructive'>
              Delete this trigger
            </Text.H5>
          </button>{' '}
          if you need.
        </Text.H5>
      )}
    </div>
  )
}
