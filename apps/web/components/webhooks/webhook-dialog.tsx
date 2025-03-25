'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import {
  Modal,
  Form,
  Input,
  Button,
  Switch,
  Toast,
} from '@latitude-data/web-ui'
import { useLatitudeAction } from '@/lib/hooks/use-latitude-action'
import { type Webhook } from '@latitude/core/services/webhooks/types'
import { createWebhook } from '@latitude/core/services/webhooks/createWebhook'
import { updateWebhook } from '@latitude/core/services/webhooks/updateWebhook'

const webhookSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().url('Must be a valid URL'),
  projectIds: z.array(z.number()).default([]),
  isActive: z.boolean().default(true),
})

type WebhookFormValues = z.infer<typeof webhookSchema>

interface WebhookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhook: Webhook | null
  onSuccess: (webhook: Webhook) => void
}

export function WebhookDialog({
  open,
  onOpenChange,
  webhook,
  onSuccess,
}: WebhookDialogProps) {
  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      name: '',
      url: '',
      projectIds: [],
      isActive: true,
    },
  })

  // Reset form when webhook changes
  useEffect(() => {
    if (webhook) {
      form.reset({
        name: webhook.name,
        url: webhook.url,
        projectIds: webhook.projectIds,
        isActive: webhook.isActive,
      })
    } else {
      form.reset({
        name: '',
        url: '',
        projectIds: [],
        isActive: true,
      })
    }
  }, [webhook, form])

  // Create webhook
  const { mutate: createWebhookMutation } = useLatitudeAction(createWebhook, {
    onSuccess: (data) => {
      if (data.ok) {
        onSuccess(data.value)
        Toast.success({
          title: 'Webhook created',
          description: 'The webhook has been created successfully.',
        })
      }
    },
  })

  // Update webhook
  const { mutate: updateWebhookMutation } = useLatitudeAction(updateWebhook, {
    onSuccess: (data) => {
      if (data.ok) {
        onSuccess(data.value)
        Toast.success({
          title: 'Webhook updated',
          description: 'The webhook has been updated successfully.',
        })
      }
    },
  })

  const onSubmit = async (values: WebhookFormValues) => {
    if (webhook) {
      const result = await updateWebhookMutation({
        id: webhook.id,
        workspaceId: webhook.workspaceId,
        ...values,
      })
      if (!result.ok) {
        Toast.error({
          title: 'Error',
          description: 'Failed to update webhook. Please try again.',
        })
      }
    } else {
      const result = await createWebhookMutation({
        workspaceId: 1, // TODO: Get from context
        ...values,
      })
      if (!result.ok) {
        Toast.error({
          title: 'Error',
          description: 'Failed to create webhook. Please try again.',
        })
      }
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {webhook ? 'Edit Webhook' : 'Create Webhook'}
          </Modal.Title>
          <Modal.Description>
            {webhook
              ? 'Update your webhook configuration.'
              : 'Configure a new webhook to receive real-time updates.'}
          </Modal.Description>
        </Modal.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <Form.Field
              control={form.control}
              name='name'
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Name</Form.Label>
                  <Form.Control>
                    <Input placeholder='My Webhook' {...field} />
                  </Form.Control>
                  <Form.Description>
                    A descriptive name for your webhook.
                  </Form.Description>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name='url'
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>URL</Form.Label>
                  <Form.Control>
                    <Input
                      placeholder='https://api.example.com/webhook'
                      {...field}
                    />
                  </Form.Control>
                  <Form.Description>
                    The URL where webhook events will be sent.
                  </Form.Description>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name='isActive'
              render={({ field }) => (
                <Form.Item className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <Form.Label className='text-base'>Active</Form.Label>
                    <Form.Description>
                      Enable or disable this webhook.
                    </Form.Description>
                  </div>
                  <Form.Control>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Form.Control>
                </Form.Item>
              )}
            />

            <Modal.Footer>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type='submit'>{webhook ? 'Update' : 'Create'}</Button>
            </Modal.Footer>
          </form>
        </Form>
      </Modal.Content>
    </Modal>
  )
}
