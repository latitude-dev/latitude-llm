'use client'

import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { clearWorkspaceCacheAction } from '$/actions/admin/workspaces/clearCache'

type Props = {
  workspaceId: number
}

export function ClearCacheButton({ workspaceId }: Props) {
  const [deletedCount, setDeletedCount] = useState<number | null>(null)
  const { execute, isPending } = useLatitudeAction(clearWorkspaceCacheAction, {
    onSuccess: ({ data }) => {
      setDeletedCount(data.deletedCount)
      setTimeout(() => setDeletedCount(null), 5000)
    },
  })

  const handleClearCache = async () => {
    if (
      !confirm(
        'Are you sure you want to clear all cache entries for this workspace? This action cannot be undone.',
      )
    ) {
      return
    }

    await execute({ workspaceId })
  }

  return (
    <div className='flex flex-col gap-2'>
      <Button
        fancy
        onClick={handleClearCache}
        variant='destructive'
        disabled={isPending}
      >
        {isPending ? 'Clearing Cache...' : 'Clear Workspace Cache'}
      </Button>
      {deletedCount !== null && (
        <Text.H6 color='foregroundMuted'>
          Successfully cleared {deletedCount} cache{' '}
          {deletedCount === 1 ? 'entry' : 'entries'}
        </Text.H6>
      )}
    </div>
  )
}
