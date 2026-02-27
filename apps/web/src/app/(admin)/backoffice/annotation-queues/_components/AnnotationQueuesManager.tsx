'use client'

import React, { useState } from 'react'
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
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { createAnnotationQueueAction } from '$/actions/admin/annotationQueues/create'
import { addTracesToQueueAction } from '$/actions/admin/annotationQueues/addTraces'
import useSWR from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'

type AnnotationQueue = {
  id: number
  workspaceId: number
  projectId: number
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}

export function AnnotationQueuesManager() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [addTracesState, setAddTracesState] = useState<{
    isOpen: boolean
    queue: AnnotationQueue | null
  }>({ isOpen: false, queue: null })

  const fetcher = useFetcher<AnnotationQueue[]>(
    ROUTES.api.admin.annotationQueues.root,
  )
  const { data: queues = [], mutate } = useSWR<AnnotationQueue[]>(
    'admin-annotation-queues',
    fetcher,
  )

  const { execute: createQueue, isPending: isCreating } = useLatitudeAction(
    createAnnotationQueueAction,
    {
      onSuccess: () => {
        toast({ title: 'Success', description: 'Queue created' })
        mutate()
        setIsCreateModalOpen(false)
      },
    },
  )

  const { execute: addTraces, isPending: isAddingTraces } = useLatitudeAction(
    addTracesToQueueAction,
    {
      onSuccess: () => {
        toast({ title: 'Success', description: 'Traces added to queue' })
        setAddTracesState({ isOpen: false, queue: null })
      },
    },
  )

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const workspaceId = Number(formData.get('workspaceId'))
    const projectId = Number(formData.get('projectId'))
    const name = formData.get('name')?.toString()
    const description = formData.get('description')?.toString()

    if (!name || !workspaceId || !projectId) return

    await createQueue({ workspaceId, projectId, name, description })
  }

  const handleAddTraces = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!addTracesState.queue) return

    const formData = new FormData(e.currentTarget)
    const traceIds = formData.get('traceIds')?.toString()

    if (!traceIds) return

    await addTraces({ queueId: addTracesState.queue.id, traceIds })
  }

  return (
    <div className='space-y-6'>
      <div className='space-y-4'>
        <div className='flex justify-between items-center'>
          <Text.H4B>Queues</Text.H4B>
          <Button fancy onClick={() => setIsCreateModalOpen(true)}>
            Create Queue
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queues.map((queue) => (
              <TableRow key={queue.id}>
                <TableCell>{queue.id}</TableCell>
                <TableCell>{queue.name}</TableCell>
                <TableCell>{queue.workspaceId}</TableCell>
                <TableCell>{queue.projectId}</TableCell>
                <TableCell>
                  {new Date(queue.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant='outline'
                    size='small'
                    onClick={() => setAddTracesState({ isOpen: true, queue })}
                  >
                    Add Traces
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Modal
        dismissible
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        title='Create Annotation Queue'
        description='Create a queue in a specific project to review traces'
      >
        <form onSubmit={handleCreate}>
          <FormWrapper>
            <Input
              name='workspaceId'
              label='Workspace ID'
              type='number'
              placeholder='Enter workspace ID'
              required
            />
            <Input
              name='projectId'
              label='Project ID'
              type='number'
              placeholder='Enter project ID'
              required
            />
            <Input
              name='name'
              label='Queue Name'
              placeholder='e.g. Support QA Reviews'
              required
            />
            <TextArea
              name='description'
              label='Description'
              placeholder='Optional description'
            />
            <div className='flex gap-2'>
              <Button type='submit' disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create Queue'}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </FormWrapper>
        </form>
      </Modal>

      <Modal
        dismissible
        open={addTracesState.isOpen}
        onOpenChange={(open) =>
          setAddTracesState((prev) => ({ ...prev, isOpen: open }))
        }
        title={`Add Traces to "${addTracesState.queue?.name ?? ''}"`}
        description='Enter trace IDs separated by commas'
      >
        <form onSubmit={handleAddTraces}>
          <FormWrapper>
            <TextArea
              name='traceIds'
              label='Trace IDs'
              placeholder='trace_abc123, trace_def456, ...'
              required
            />
            <div className='flex gap-2'>
              <Button type='submit' disabled={isAddingTraces}>
                {isAddingTraces ? 'Adding...' : 'Add Traces'}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() =>
                  setAddTracesState({ isOpen: false, queue: null })
                }
              >
                Cancel
              </Button>
            </div>
          </FormWrapper>
        </form>
      </Modal>
    </div>
  )
}
