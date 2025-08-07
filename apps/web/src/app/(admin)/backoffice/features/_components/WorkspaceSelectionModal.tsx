'use client'

import { useState, useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { MultipleInput } from '@latitude-data/web-ui/molecules/MultipleInput'

type WorkspaceSelectionModalProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  featureName: string
  onConfirm: (workspaceIds: number[], enabled: boolean) => Promise<void>
  isLoading: boolean
  currentWorkspaceIds: number[]
}

export function WorkspaceSelectionModal({
  isOpen,
  onOpenChange,
  featureName,
  onConfirm,
  isLoading,
  currentWorkspaceIds,
}: WorkspaceSelectionModalProps) {
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<number[]>(currentWorkspaceIds)

  const handleMultipleInputChange = useCallback((values: number[]) => {
    setSelectedWorkspaceIds(values)
  }, [])

  const handleConfirm = async () => {
    // Determine which workspaces to enable/disable
    const toEnable = selectedWorkspaceIds.filter((id) => !currentWorkspaceIds.includes(id))
    const toDisable = currentWorkspaceIds.filter((id) => !selectedWorkspaceIds.includes(id))

    // Enable for new workspaces
    if (toEnable.length > 0) {
      await onConfirm(toEnable, true)
    }

    // Disable for removed workspaces
    if (toDisable.length > 0) {
      await onConfirm(toDisable, false)
    }

    onOpenChange(false)
  }

  const handleCancel = () => {
    setSelectedWorkspaceIds(currentWorkspaceIds)
    onOpenChange(false)
  }

  return (
    <Modal
      dismissible
      open={isOpen}
      onOpenChange={onOpenChange}
      title={`Manage Feature: ${featureName}`}
      description='Enter workspace IDs to enable/disable this feature'
    >
      <FormWrapper>
        <MultipleInput
          values={selectedWorkspaceIds}
          setValues={handleMultipleInputChange}
          type='number'
          placeholder='Enter workspace ID and press Enter'
          disabled={isLoading}
          label='Workspace IDs'
          description='Enter the workspace IDs where this feature should be enabled'
        />
        <div className='flex gap-2 pt-4'>
          <Button fancy onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Updating...' : 'Update Feature'}
          </Button>
          <Button fancy variant='outline' onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </FormWrapper>
    </Modal>
  )
}
