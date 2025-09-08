'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useState } from 'react'
import { WorkspaceGrants } from './_components/WorkspaceGrants'

export default function GrantsAdmin() {
  const [workspaceId, setWorkspaceId] = useState<number>()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number>()

  return (
    <div className='container mx-auto p-6 max-w-7xl'>
      <div className='space-y-8'>
        <div className='flex flex-col gap-2'>
          <Text.H1>Grants Management</Text.H1>
          <Text.H4 color='foregroundMuted'>
            Manage quota grants for workspaces. Issue new grants or revoke
            existing ones.
          </Text.H4>
        </div>
        <div className='p-6 border rounded-lg bg-card'>
          <div className='space-y-4'>
            <Text.H3>Select Workspace</Text.H3>
            <div className='flex gap-3 items-end'>
              <div className='flex-1'>
                <Input
                  type='number'
                  min={1}
                  label='Workspace ID'
                  placeholder='Enter workspace ID'
                  value={workspaceId ?? ''}
                  onChange={(event) => {
                    const value = parseInt(event.target.value)
                    if (!value || isNaN(value)) {
                      setWorkspaceId(undefined)
                    } else {
                      setWorkspaceId(value)
                    }
                  }}
                />
              </div>
              <Button
                onClick={(event) => {
                  event.preventDefault()
                  setSelectedWorkspaceId(workspaceId)
                }}
                disabled={!workspaceId}
                fancy
              >
                See Grants
              </Button>
            </div>
          </div>
        </div>
        {selectedWorkspaceId && (
          <WorkspaceGrants workspaceId={selectedWorkspaceId} />
        )}
      </div>
    </div>
  )
}
