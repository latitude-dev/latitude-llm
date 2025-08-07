'use client'

import type React from 'react'
import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import useFeatures from '$/stores/features'
import useAdminFeatures from '$/stores/adminFeatures'
import { WorkspaceSelectionModal } from './WorkspaceSelectionModal'

export function FeaturesManager() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [workspaceModalState, setWorkspaceModalState] = useState<{
    isOpen: boolean
    featureId: number | null
    featureName: string
    currentWorkspaceIds: number[]
  }>({
    isOpen: false,
    featureId: null,
    featureName: '',
    currentWorkspaceIds: [],
  })

  const { data: features, create, isCreating, destroy, isDestroying } = useFeatures()

  const { data: adminFeatures, toggleForWorkspaces, isToggling, mutate } = useAdminFeatures()

  const handleCreateFeature = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name')?.toString()
    const description = formData.get('description')?.toString()

    if (!name) return

    await create({ name, description })

    mutate() // Refetch workspace features after creating a new feature

    setIsCreateModalOpen(false)
  }

  const handleDeleteFeature = async (feature: { id: number; name: string }) => {
    if (confirm(`Are you sure you want to delete the feature "${feature.name}"?`)) {
      await destroy({ id: feature.id })

      mutate() // Refetch workspace features after creating a new feature
    }
  }

  const handleManageWorkspaces = (feature: {
    id: number
    name: string
    workspaces: {
      id: number
      name: string
      enabled: boolean
    }[]
  }) => {
    setWorkspaceModalState({
      isOpen: true,
      featureId: feature.id,
      featureName: feature.name,
      currentWorkspaceIds: feature.workspaces.filter((w) => w.enabled).map((w) => w.id),
    })
  }

  const handleWorkspaceToggle = async (workspaceIds: number[], enabled: boolean) => {
    if (workspaceModalState.featureId) {
      await toggleForWorkspaces({
        featureId: workspaceModalState.featureId,
        workspaceIds,
        enabled,
      })
    }
  }

  return (
    <div className='space-y-6'>
      {/* Features Management Section */}
      <div className='space-y-4'>
        <div className='flex justify-between items-center'>
          <div className='flex flex-col gap-2'>
            <Text.H4B>Available Features</Text.H4B>
            <Text.H5 color='foregroundMuted'>
              Manage feature toggles for workspaces. Create new features and toggle them on/off for
              specific workspaces.
            </Text.H5>
          </div>
          <Button fancy onClick={() => setIsCreateModalOpen(true)}>
            Create Feature
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {features.map((feature) => (
              <TableRow key={feature.id}>
                <TableCell>{feature.name}</TableCell>
                <TableCell>{feature.description || '-'}</TableCell>
                <TableCell>{new Date(feature.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button
                    iconProps={{ name: 'trash' }}
                    variant='ghost'
                    size='small'
                    onClick={() => handleDeleteFeature(feature)}
                    disabled={isDestroying}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Feature Management with Workspace Counts */}
      <div className='space-y-4'>
        <div className='flex flex-col gap-2'>
          <Text.H4B>Feature Workspace Management</Text.H4B>
          <Text.H5 color='foregroundMuted'>
            Manage which workspaces have access to each feature by entering workspace IDs
          </Text.H5>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Workspace IDs Enabled</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adminFeatures.map((feature) => (
              <TableRow key={feature.id}>
                <TableCell>{feature.name}</TableCell>
                <TableCell>{feature.description || '-'}</TableCell>
                <TableCell>
                  <Tooltip
                    trigger={
                      <>
                        {feature.workspaces.filter((w) => w.enabled).length} workspace
                        {feature.workspaces.filter((w) => w.enabled).length !== 1 ? 's' : ''}
                      </>
                    }
                  >
                    {feature.workspaces.length > 0
                      ? feature.workspaces
                          .filter((w) => w.enabled)
                          .map((w) => w.id)
                          .join(', ')
                      : 'No workspaces enabled'}
                  </Tooltip>
                </TableCell>
                <TableCell className='py-1'>
                  <Button
                    fancy
                    variant='outline'
                    size='small'
                    onClick={() => handleManageWorkspaces(feature)}
                    disabled={isToggling}
                  >
                    Manage Workspace IDs
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create Feature Modal */}
      <Modal
        dismissible
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        title='Create New Feature'
        description='Add a new feature that can be toggled for workspaces'
      >
        <form onSubmit={handleCreateFeature}>
          <FormWrapper>
            <Input name='name' label='Feature Name' placeholder='Enter feature name' required />
            <TextArea
              name='description'
              label='Description'
              placeholder='Enter feature description (optional)'
            />
            <div className='flex gap-2'>
              <Button type='submit' disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create Feature'}
              </Button>
              <Button type='button' variant='outline' onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </FormWrapper>
        </form>
      </Modal>

      {/* Workspace Selection Modal */}
      {workspaceModalState.isOpen && (
        <WorkspaceSelectionModal
          isOpen={workspaceModalState.isOpen}
          onOpenChange={(open) => setWorkspaceModalState((prev) => ({ ...prev, isOpen: open }))}
          featureName={workspaceModalState.featureName}
          onConfirm={handleWorkspaceToggle}
          isLoading={isToggling}
          currentWorkspaceIds={workspaceModalState.currentWorkspaceIds}
        />
      )}
    </div>
  )
}
