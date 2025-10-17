'use client'

import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { invalidateFirstPageCacheAction } from '$/actions/admin/integrations/invalidateFirstPageCache'
import { toast } from '@latitude-data/web-ui/atoms/Toast'

export function InvalidateFirstPageCache() {
  const [lastInvalidated, setLastInvalidated] = useState<Date | null>(null)

  const { execute: invalidateCache, isPending } = useLatitudeAction(
    invalidateFirstPageCacheAction,
    {
      onSuccess: ({ data }) => {
        setLastInvalidated(new Date())
        toast({
          title: 'Cache Invalidated',
          description: `Successfully cleared first page cache. Deleted ${data.deletedCount} key(s).`,
        })
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to invalidate cache',
          variant: 'destructive',
        })
      },
    },
  )

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2'>
        <Text.H4B>First Page Cache</Text.H4B>
        <Text.H5 color='foregroundMuted'>
          Clear the cached first page of Pipedream apps. This cache is used when
          users first load the integrations list without any search query.
        </Text.H5>
      </div>

      <div className='flex items-center gap-4'>
        <Button
          fancy
          onClick={() => invalidateCache(undefined)}
          disabled={isPending}
          iconProps={{ name: 'trash' }}
        >
          {isPending ? 'Clearing...' : 'Clear First Page Cache'}
        </Button>

        {lastInvalidated && (
          <Text.H5 color='foregroundMuted'>
            Last cleared: {lastInvalidated.toLocaleTimeString()}
          </Text.H5>
        )}
      </div>
    </div>
  )
}
