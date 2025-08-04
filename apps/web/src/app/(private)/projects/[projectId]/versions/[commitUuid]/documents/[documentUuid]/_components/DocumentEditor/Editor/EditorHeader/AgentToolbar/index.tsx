import useIntegrations from '$/stores/integrations'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'
import { cn } from '@latitude-data/web-ui/utils'
import { Config } from 'promptl-ai'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  UseLatitudeAgentsConfig,
  useLatitudeAgentsConfig,
} from '../../PromptConfiguration/utils'
import { IntegrationsList } from '../../PromptIntegrations/IntegrationsList'
import { ItemWrapper } from '../../PromptIntegrations/IntegrationTools'
import {
  ActiveIntegrations,
  useActiveIntegrations,
} from '../../PromptIntegrations/useActiveIntegrations'
import { EditorHeaderProps } from '../index'

const singularPluralLabel = (c: number, s: string, p: string) =>
  c === 1 ? `1 ${s}` : `${c} ${p}`

export const TAB_SECTIONS = {
  tools: 'tools',
  subAgents: 'subAgents',
} as const
export type TabSection = (typeof TAB_SECTIONS)[keyof typeof TAB_SECTIONS]
function useTabs({
  toolsCount,
  subAgentsCount,
}: {
  toolsCount: number
  subAgentsCount: number
}) {
  const [selected, setTab] = useState<TabSection>(TAB_SECTIONS.tools)
  return useMemo(() => {
    return {
      selected,
      setTab,
      options: [
        {
          label: singularPluralLabel(toolsCount, 'Tool', 'Tools'),
          value: TAB_SECTIONS.tools,
        },
        {
          label: singularPluralLabel(subAgentsCount, 'Sub-agent', 'Sub-agents'),
          value: TAB_SECTIONS.subAgents,
        },
      ],
    }
  }, [toolsCount, subAgentsCount, selected, setTab])
}

function useCounters({
  prompt,
  onChangePrompt,
  config = {},
}: {
  config: Config | undefined
  prompt: EditorHeaderProps['prompt']
  onChangePrompt: EditorHeaderProps['onChangePrompt']
}) {
  const { isLoading } = useIntegrations({
    includeLatitudeTools: true,
    withTools: true,
  })
  const setConfig = useCallback(
    (cfg: Record<string, unknown>) => {
      onChangePrompt(updatePromptMetadata(prompt, cfg))
    },
    [prompt, onChangePrompt],
  )

  const { isInitialized, activeIntegrations } = useActiveIntegrations({
    prompt,
  })
  const toolsCount = Object.keys(activeIntegrations).length
  const toolsLabel =
    toolsCount > 0
      ? singularPluralLabel(toolsCount, 'Tool', 'Tools')
      : 'No tools'

  const subAgents = useLatitudeAgentsConfig({
    config,
    setConfig,
    canUseSubagents: true,
  })
  const subAgentsCount = subAgents.selectedAgents.length
  const subAgentsLabel =
    subAgentsCount > 0
      ? singularPluralLabel(subAgentsCount, 'Sub-agent', 'Sub-agents')
      : 'No sub-agents'

  return useMemo(
    () => ({
      toolsLabel,
      toolsCount,
      subAgentsLabel,
      subAgentsCount,
      subAgents,
      isLoading: !isInitialized || isLoading || subAgents.isLoading,
    }),
    [
      toolsLabel,
      toolsCount,
      subAgentsLabel,
      subAgentsCount,
      subAgents,
      isInitialized,
      isLoading,
    ],
  )
}

function handleAgentChange({
  checked,
  config = {},
}: {
  checked: boolean
  config: Config | undefined
}) {
  const newAgentValue = checked ? 'agent' : undefined

  const updates: Record<string, unknown> = { type: newAgentValue }

  if (newAgentValue !== 'agent') {
    updates.disableAgentOptimization = undefined
  }

  return { ...config, ...updates }
}

function SubAgentItem({
  availableAgents,
  agentPath,
  toggleAgent,
  isFirst = false,
  disabled,
}: {
  agentPath: string
  toggleAgent: UseLatitudeAgentsConfig['toggleAgent']
  availableAgents: UseLatitudeAgentsConfig['availableAgents']
  isFirst?: boolean
  disabled?: boolean
}) {
  const [checked, setChecked] = useState(availableAgents.includes(agentPath))
  const onClick = useCallback(() => {
    setChecked(!checked)
    toggleAgent(agentPath)
  }, [toggleAgent, agentPath, checked])
  const name = agentPath.split('/').pop() || ''
  return (
    <ItemWrapper isFirst={isFirst}>
      <div className='flex flex-row items-start gap-2 justify-between min-w-0'>
        <div className='flex flex-col gap-y-1'>
          <Text.H6 ellipsis noWrap color='foregroundMuted'>
            {agentPath}
          </Text.H6>
          <Text.H6B ellipsis noWrap>
            {name}
          </Text.H6B>
        </div>
        <SwitchToggle checked={checked} onClick={onClick} disabled={disabled} />
      </div>
    </ItemWrapper>
  )
}
function Content({
  isMerged,
  prompt,
  selectedTab,
  subAgents,
}: {
  isMerged: EditorHeaderProps['isMerged']
  selectedTab: TabSection
  prompt: EditorHeaderProps['prompt']
  subAgents: UseLatitudeAgentsConfig
}) {
  const { data: integrations, isLoading } = useIntegrations({
    includeLatitudeTools: true,
    withTools: true,
  })
  const { activeIntegrations, addIntegrationTool, removeIntegrationTool } =
    useActiveIntegrations({
      prompt,
    })

  return (
    <>
      {selectedTab === TAB_SECTIONS.tools ? (
        <IntegrationsList
          disabled={isMerged}
          isLoading={isLoading}
          integrations={integrations ?? []}
          activeIntegrations={activeIntegrations as ActiveIntegrations}
          addIntegrationTool={addIntegrationTool}
          removeIntegrationTool={removeIntegrationTool}
        />
      ) : null}

      {selectedTab === TAB_SECTIONS.subAgents ? (
        <ul className='bg-backgroundCode overflow-auto custom-scrollbar'>
          {subAgents.availableAgents.map((agent, index) => (
            <li key={agent}>
              <SubAgentItem
                isFirst={index === 0}
                agentPath={agent}
                toggleAgent={subAgents.toggleAgent}
                availableAgents={subAgents.selectedAgents}
                disabled={isMerged}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

function AgentToolbarSkeleton() {
  return <Skeleton className='h-[3.125rem] w-full rounded-lg' />
}

export function AgentToolbar({
  isAgent,
  config,
  onChangePrompt,
  prompt,
  isMerged,
}: {
  isAgent: boolean
  config: Config | undefined
  onChangePrompt: EditorHeaderProps['onChangePrompt']
  prompt: EditorHeaderProps['prompt']
  isMerged: EditorHeaderProps['isMerged']
}) {
  const counters = useCounters({ prompt, config, onChangePrompt })
  const tabs = useTabs({
    toolsCount: counters.toolsCount,
    subAgentsCount: counters.subAgentsCount,
  })
  const [agent, setAgent] = useState(isAgent)
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const onAgentToggle = useCallback(
    async (checked: boolean) => {
      setAgent(checked)
      onChangePrompt(
        updatePromptMetadata(prompt, handleAgentChange({ checked, config })),
      )
    },
    [config, prompt, onChangePrompt],
  )
  const onToggle = useCallback(
    (nextIsExpanded: boolean) => {
      if (isMerged) return
      if (!isAgent) onAgentToggle(true)

      setIsExpanded(nextIsExpanded)
    },
    [isAgent, onAgentToggle, isMerged],
  )

  useEffect(() => {
    setAgent(isAgent)
  }, [isAgent])

  return (
    <ClientOnly loader={<AgentToolbarSkeleton />}>
      {counters.isLoading ? (
        <AgentToolbarSkeleton />
      ) : (
        <CollapsibleBox
          paddingLeft={false}
          paddingRight={false}
          paddingBottom={false}
          scrollable={false}
          handleIcon={agent}
          avoidToggleOnTitleClick
          headerClassName={cn({ '!cursor-default': !agent })}
          isExpanded={isExpanded}
          onToggle={onToggle}
          collapsedContentHeader={
            <div className='flex justify-end'>
              <Text.H5 color='foregroundMuted' userSelect={false}>
                {counters.toolsLabel}
                {' · '}
                {counters.subAgentsLabel}
              </Text.H5>
            </div>
          }
          title={
            <div className='flex items-center gap-x-2'>
              <Text.H5 userSelect={false}>Agent</Text.H5>
              <SwitchToggle
                checked={agent}
                onCheckedChange={onAgentToggle}
                disabled={isMerged}
              />
              <Tooltip trigger={<Icon name='info' color='foregroundMuted' />}>
                Make the prompt an agent to use tools and other agents
              </Tooltip>
            </div>
          }
          expandedContent={
            <div className='w-full flex flex-col overflow-hidden max-h-[calc((100vh/2)-10rem)]'>
              <div className='flex justify-center border-b border-border pb-4 px-4'>
                <TabSelector<TabSection>
                  options={tabs.options}
                  selected={tabs.selected}
                  onSelect={tabs.setTab}
                  fullWidth
                />
              </div>
              <Content
                isMerged={isMerged}
                prompt={prompt}
                selectedTab={tabs.selected}
                subAgents={counters.subAgents}
              />
            </div>
          }
        />
      )}
    </ClientOnly>
  )
}
