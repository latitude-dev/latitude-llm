import React from 'react'

import { Workspace } from '@latitude-data/core'
import { Input, Text } from '$ui/ds/atoms'
import { SessionWorkspace } from '$ui/providers'
import { useDebouncedCallback } from 'use-debounce'

export default function WorkspaceName({
  workspace,
  update,
}: {
  workspace: SessionWorkspace
  update: (payload: { name: string }) => Promise<Workspace>
}) {
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
