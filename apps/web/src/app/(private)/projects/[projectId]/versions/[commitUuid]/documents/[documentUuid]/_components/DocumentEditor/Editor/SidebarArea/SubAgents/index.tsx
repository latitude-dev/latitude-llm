import { useMemo, useCallback } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSidebarStore } from '../hooks/useSidebarStore'
import { usePromptConfigInSidebar } from '../hooks/usePromptConfigInSidebar'
import { SidebarSection } from '../Section'
import { SubAgentItem } from './SubAgentItem'
import {
  resolveRelativePath,
  createRelativePath,
} from '@latitude-data/constants'
import { MultiSelect } from '@latitude-data/web-ui/molecules/MultiSelect'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export function SubAgentsSidebarSection() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const isLive = !!commit.mergedAt
  const { toggleAgent } = usePromptConfigInSidebar()

  const { selectedAgents, pathToUuidMap } = useSidebarStore((state) => ({
    selectedAgents: state.selectedAgents,
    pathToUuidMap: state.pathToUuidMap,
  }))

  const availableAgents = useMemo(() => {
    if (!pathToUuidMap || Object.keys(pathToUuidMap).length === 0) return []
    return Object.keys(pathToUuidMap).filter(
      (agentPath) => agentPath !== document.path,
    )
  }, [pathToUuidMap, document.path])

  const selectedAgentsFullPaths = useMemo(() => {
    if (!Array.isArray(selectedAgents)) return []
    return selectedAgents
      .filter(Boolean)
      .map((relativePath) => resolveRelativePath(relativePath, document.path))
  }, [selectedAgents, document.path])

  const agentOptions = useMemo(() => {
    return availableAgents.map((agentPath) => ({
      label: agentPath.split('/').pop() || agentPath,
      value: agentPath,
      icon: 'bot' as const,
    }))
  }, [availableAgents])

  const handleAgentsChange = useCallback(
    (selectedPaths: string[]) => {
      // Convert full paths to relative paths
      const relativePaths = selectedPaths.map((fullPath) =>
        createRelativePath(fullPath, document.path),
      )

      // Find which agents were added or removed
      const currentRelativePaths = selectedAgents
      const addedPaths = relativePaths.filter(
        (path) => !currentRelativePaths.includes(path),
      )
      const removedPaths = currentRelativePaths.filter(
        (path) => !relativePaths.includes(path),
      )

      // Toggle each added/removed agent
      addedPaths.forEach((path) => {
        const fullPath = resolveRelativePath(path, document.path)
        toggleAgent(fullPath)
      })
      removedPaths.forEach((path) => {
        const fullPath = resolveRelativePath(path, document.path)
        toggleAgent(fullPath)
      })
    },
    [selectedAgents, document.path, toggleAgent],
  )

  const actions = useMemo(
    () => [
      {
        onClick: () => {},
        disabled: isLive,
        customComponent: (
          <MultiSelect
            options={agentOptions}
            value={selectedAgentsFullPaths}
            onChange={handleAgentsChange}
            disabled={isLive}
            modalPopover
            trigger={
              <Button
                variant='ghost'
                size='small'
                iconProps={{ name: 'plus', color: 'foregroundMuted' }}
                disabled={isLive}
              />
            }
          />
        ),
      },
    ],
    [agentOptions, selectedAgentsFullPaths, handleAgentsChange, isLive],
  )

  return (
    <SidebarSection title='Sub-agents' actions={actions}>
      <div className='flex flex-col'>
        {selectedAgentsFullPaths.map((agentPath) => {
          const documentUuid = pathToUuidMap[agentPath]
          return (
            <SubAgentItem
              key={agentPath}
              agentPath={agentPath}
              documentUuid={documentUuid}
              projectId={project.id}
              commitUuid={commit.uuid}
              onRemove={() => toggleAgent(agentPath)}
              disabled={isLive}
            />
          )
        })}
      </div>
    </SidebarSection>
  )
}
