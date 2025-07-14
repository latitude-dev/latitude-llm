'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { MultiSelect } from '@latitude-data/web-ui/molecules/MultiSelect'
import useAdminWorkspaces from '$/stores/adminWorkspaces'

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
  console.log(currentWorkspaceIds)

  const { data: workspaces } = useAdminWorkspaces()
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] =
    useState<number[]>(currentWorkspaceIds)

  // Transform workspaces to MultiSelect format
  const workspaceOptions = workspaces.map((workspace) => ({
    value: workspace.id.toString(),
    label: workspace.name,
  }))

  // Convert selected IDs to strings for MultiSelect
  const selectedValues = selectedWorkspaceIds.map((id) => id.toString())

  const handleMultiSelectChange = useCallback((values: string[]) => {
    const numericIds = values.map((value) => parseInt(value, 10))
    setSelectedWorkspaceIds(numericIds)
  }, [])

  const handleConfirm = async () => {
    // Determine which workspaces to enable/disable
    const toEnable = selectedWorkspaceIds.filter(
      (id) => !currentWorkspaceIds.includes(id),
    )
    const toDisable = currentWorkspaceIds.filter(
      (id) => !selectedWorkspaceIds.includes(id),
    )

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
      description='Select workspaces to enable/disable this feature'
    >
      <FormWrapper>
        <div className='space-y-4'>
          <div>
            <Text.H4>Select Workspaces</Text.H4>
            <MultiSelect
              options={workspaceOptions}
              defaultValue={selectedValues}
              onChange={handleMultiSelectChange}
              placeholder='Search and select workspaces...'
              disabled={isLoading}
              maxCount={5}
            />
          </div>
        </div>
        <div className='flex gap-2 pt-4'>
          <Button fancy onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Updating...' : 'Update Feature'}
          </Button>
          <Button
            fancy
            variant='outline'
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </div>
      </FormWrapper>
    </Modal>
  )
}
