'use client'
import React from 'react'

import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { useDebouncedCallback } from 'use-debounce'

export default function WorkspaceName() {
  const { data: workspace, isLoading, updateName } = useCurrentWorkspace()

  const onChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const name = ev.target.value
    if (!name) return

    return updateName({ name: ev.target.value })
  }
  const debouncedChange = useDebouncedCallback(onChange, 500, {
    trailing: true,
  })

  return (
    <div className='flex flex-col gap-4 max-w-[50%]'>
      {isLoading && (
        <FormField label='Workspace name'>
          <Skeleton className='h-8 w-full px-2 py-1' />
        </FormField>
      )}
      {!isLoading && workspace && (
        <Input
          defaultValue={workspace.name}
          label='Workspace name'
          onChange={debouncedChange}
        />
      )}
    </div>
  )
}
