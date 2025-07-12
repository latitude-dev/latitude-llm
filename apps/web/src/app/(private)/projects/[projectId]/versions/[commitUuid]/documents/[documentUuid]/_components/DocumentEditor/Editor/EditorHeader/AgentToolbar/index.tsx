import { useCallback, useEffect, useMemo, useState } from 'react'
import { Config } from 'promptl-ai'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import useIntegrations from '$/stores/integrations'
import { IntegrationsList } from '../../PromptIntegrations/IntegrationsList'
import { ItemWrapper } from '../../PromptIntegrations/IntegrationTools'
import { useActiveIntegrations } from '../../PromptIntegrations/useActiveIntegrations'
import { EditorHeaderProps } from '../index'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'
import {
  UseLatitudeAgentsConfig,
  useLatitudeAgentsConfig,
} from '../../PromptConfiguration/utils'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'

const singularPluralLabel = (c: number, s: string, p: string) =>
  c === 0 ? `0 ${p}` : c === 1 ? `1 ${s}` : `${c} ${p} `

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
  const { data: integrations, isLoading } = useIntegrations({
    includeLatitudeTools: true,
    withTools: true,
  })
  const setConfig = useCallback(
    (cfg: Record<string, unknown>) => {
      onChangePrompt(updatePromptMetadata(prompt, cfg))
    },
    [prompt, onChangePrompt],
  )

  const subAgents = useLatitudeAgentsConfig({
    config,
    setConfig,
    canUseSubagents: true,
  })

  const { isInitialized, activeIntegrations } = useActiveIntegrations({
    prompt,
    integrations,
    isLoading,
    onChangePrompt,
  })
  const toolsCount = Object.keys(activeIntegrations).length
  const toolsLabel = !isInitialized
    ? 'Loading tools...'
    : toolsCount > 0
      ? `${toolsCount} tool${toolsCount > 1 ? 's' : ''}`
      : 'No tools used'

  const subAgentsCount = subAgents.selectedAgents.length
  const subAgentsLabel = singularPluralLabel(
    subAgentsCount,
    'Sub-agent',
    'Sub-agents',
  )
  return useMemo(
    () => ({
      toolsLabel,
      toolsCount,
      subAgentsLabel,
      subAgentsCount,
      subAgents,
    }),
    [toolsLabel, toolsCount, subAgentsLabel, subAgentsCount, subAgents],
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
  onChangePrompt,
  prompt,
  selectedTab,
  subAgents,
}: {
  isMerged: EditorHeaderProps['isMerged']
  selectedTab: TabSection
  prompt: EditorHeaderProps['prompt']
  onChangePrompt: EditorHeaderProps['onChangePrompt']
  subAgents: UseLatitudeAgentsConfig
}) {
  const { data: integrations, isLoading } = useIntegrations({
    includeLatitudeTools: true,
    withTools: true,
  })
  const {
    isInitialized,
    activeIntegrations,
    addIntegrationTool,
    removeIntegrationTool,
  } = useActiveIntegrations({
    prompt,
    onChangePrompt,
    integrations,
    isLoading,
  })
  return (
    <>
      {selectedTab === TAB_SECTIONS.tools ? (
        <IntegrationsList
          disabled={isMerged}
          isLoading={!isInitialized}
          integrations={integrations ?? []}
          activeIntegrations={activeIntegrations}
          addIntegrationTool={addIntegrationTool}
          removeIntegrationTool={removeIntegrationTool}
        />
      ) : null}

      {selectedTab === TAB_SECTIONS.subAgents ? (
        <ul className='bg-backgroundCode'>
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
  const onToggle = useCallback(
    (nextIsExpanded: boolean) => {
      // Non-agent prompts should not be expanded
      if (!isAgent) return

      setIsExpanded(nextIsExpanded)
    },
    [isAgent],
  )
  const onAgentToggle = useCallback(
    async (checked: boolean) => {
      setAgent(checked)
      setIsExpanded(checked)

      onChangePrompt(
        updatePromptMetadata(prompt, handleAgentChange({ checked, config })),
      )
    },
    [config, prompt, onChangePrompt],
  )

  useEffect(() => {
    setAgent(isAgent)
  }, [isAgent])

  return (
    <ClientOnly>
      <CollapsibleBox
        paddingLeft={false}
        paddingRight={false}
        paddingBottom={false}
        avoidToggleOnTitleClick
        isExpanded={isExpanded}
        onToggle={onToggle}
        collapsedContentHeader={
          <div className='flex justify-end'>
            <Text.H5 color='foregroundMuted'>
              {counters.toolsLabel}
              {' · '}
              {counters.subAgentsLabel}
            </Text.H5>
          </div>
        }
        title={
          <div className='flex items-center gap-x-2'>
            <Text.H5>Agent</Text.H5>
            <SwitchToggle checked={agent} onCheckedChange={onAgentToggle} />
            <Tooltip trigger={<Icon name='info' color='foregroundMuted' />}>
              Prompt needs to be an agent to use tools and sub-agents.
            </Tooltip>
          </div>
        }
        expandedContent={
          <div className='w-full flex flex-col overflow-hidden'>
            <div className='flex justify-center border-b border-border pb-4'>
              <TabSelector<TabSection>
                options={tabs.options}
                selected={tabs.selected}
                onSelect={tabs.setTab}
              />
            </div>
            <Content
              isMerged={isMerged}
              prompt={prompt}
              selectedTab={tabs.selected}
              onChangePrompt={onChangePrompt}
              subAgents={counters.subAgents}
            />
          </div>
        }
      />
    </ClientOnly>
  )
}
