'use client'

import React from 'react'

import useCurrentWorkspace from '$/stores/currentWorkspace'
import { Input, Text } from '$ui/ds/atoms'
import { useDebouncedCallback } from 'use-debounce'

export default function WorkspaceName() {
  const { data: workspace, update } = useCurrentWorkspace()

  const onChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const name = ev.target.value
    if (!name) return

    return update({ name: ev.target.value })
  }
  const debouncedChange = useDebouncedCallback(onChange, 500, {
    trailing: true,
  })

  // TODO: i18n
  return (
    <div className='flex flex-col gap-4 max-w-[50%]'>
      <Text.H4B>Workspace</Text.H4B>
      <Input
        defaultValue={workspace.name}
        label='Workspace name'
        onChange={debouncedChange}
      />
    </div>
  )
}
