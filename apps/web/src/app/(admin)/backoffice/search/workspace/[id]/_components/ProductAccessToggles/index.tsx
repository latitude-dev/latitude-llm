'use client'

import { useCallback, useState } from 'react'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { updateProductAccessAction } from '$/actions/admin/workspaces/updateProductAccess'

export function ProductAccessToggles({
  workspaceId,
  promptManagerEnabled: initialPromptManager,
  agentBuilderEnabled: initialAgentBuilder,
}: {
  workspaceId: number
  promptManagerEnabled: boolean
  agentBuilderEnabled: boolean
}) {
  const { toast } = useToast()
  const [promptManagerEnabled, setPromptManagerEnabled] =
    useState(initialPromptManager)
  const [agentBuilderEnabled, setAgentBuilderEnabled] =
    useState(initialAgentBuilder)

  const { execute, isPending } = useLatitudeAction(updateProductAccessAction, {
    onSuccess: ({ data }) => {
      setPromptManagerEnabled(data.promptManagerEnabled)
      setAgentBuilderEnabled(data.agentBuilderEnabled)
      toast({
        title: 'Success',
        description: 'Product access updated',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handlePromptManagerToggle = useCallback(
    async (value: boolean) => {
      setPromptManagerEnabled(value)
      await execute({ workspaceId, promptManagerEnabled: value })
    },
    [execute, workspaceId],
  )

  const handleAgentBuilderToggle = useCallback(
    async (value: boolean) => {
      setAgentBuilderEnabled(value)
      await execute({ workspaceId, agentBuilderEnabled: value })
    },
    [execute, workspaceId],
  )

  return (
    <>
      <div className='flex flex-row items-center justify-between p-4 bg-muted/30 rounded-lg'>
        <div className='flex flex-col gap-1'>
          <Text.H5>Prompt Manager</Text.H5>
          <Text.H6 color='foregroundMuted'>
            Enable prompt management features (editor, experiments, version
            control, history). Disabling this will also disable Agent Builder.
          </Text.H6>
        </div>
        <SwitchInput
          checked={promptManagerEnabled}
          onCheckedChange={handlePromptManagerToggle}
          disabled={isPending}
        />
      </div>

      <div className='flex flex-row items-center justify-between p-4 bg-muted/30 rounded-lg'>
        <div className='flex flex-col gap-1'>
          <Text.H5>Agent Builder</Text.H5>
          <Text.H6 color='foregroundMuted'>
            Enable agent builder features (triggers, integrations, tools,
            sub-agents, home, latte). Requires Prompt Manager to be enabled.
          </Text.H6>
        </div>
        <SwitchInput
          checked={agentBuilderEnabled}
          onCheckedChange={handleAgentBuilderToggle}
          disabled={isPending || !promptManagerEnabled}
        />
      </div>
    </>
  )
}
