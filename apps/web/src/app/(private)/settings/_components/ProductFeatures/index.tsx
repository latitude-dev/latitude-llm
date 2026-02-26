'use client'

import { updateProductAccessAction } from '$/actions/workspaces/updateProductAccess'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useSession } from '$/components/Providers/SessionProvider'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCallback, useState } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@latitude-data/web-ui/atoms/Card'

export default function ProductFeatures() {
  const { toast } = useToast()
  const { productAccess } = useSession()
  const [promptManagerEnabled, setPromptManagerEnabled] = useState(
    productAccess.promptManagement,
  )
  const { execute: updateProductAccess, isPending } = useLatitudeAction(
    updateProductAccessAction,
  )

  const handlePromptManagerToggle = useCallback(
    async (enabled: boolean) => {
      setPromptManagerEnabled(enabled)

      const [, error] = await updateProductAccess({
        promptManagerEnabled: enabled,
      })

      if (error) {
        setPromptManagerEnabled(!enabled)
        toast({
          title: 'Failed to update product features',
          description: error.message,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: enabled ? 'Prompt Manager enabled' : 'Prompt Manager disabled',
        description: enabled
          ? 'You can now create and manage prompts'
          : 'Prompt management features are now hidden',
      })

      window.location.reload()
    },
    [updateProductAccess, toast],
  )

  return (
    <Card shadow='sm' background='light'>
      <CardHeader>
        <CardTitle>Product features</CardTitle>
        <CardDescription>
          Enable or disable features for your workspace. Changes will take
          effect immediately for all members.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-row gap-x-4'>
        <div className='flex flex-col gap-6 py-4'>
          <div className='flex flex-row items-start justify-between gap-4'>
            <div className='flex flex-col gap-1'>
              <Text.H5M>Monitoring</Text.H5M>
              <Text.H6 color='foregroundMuted'>
                Monitor your AI applications with traces and evaluations. This
                feature is always enabled.
              </Text.H6>
            </div>
            <Tooltip asChild trigger={<SwitchToggle checked disabled />}>
              Monitoring is enabled by default and cannot be disabled
            </Tooltip>
          </div>

          <div className='flex flex-row items-start justify-between gap-4'>
            <div className='flex flex-col gap-1'>
              <Text.H5M>Prompt Manager</Text.H5M>
              <Text.H6 color='foregroundMuted'>
                Create, edit, and version your prompts. Enable this to access
                the full prompt editor, experiments, and optimization features.
              </Text.H6>
            </div>
            <SwitchToggle
              checked={promptManagerEnabled}
              onCheckedChange={handlePromptManagerToggle}
              disabled={isPending}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
