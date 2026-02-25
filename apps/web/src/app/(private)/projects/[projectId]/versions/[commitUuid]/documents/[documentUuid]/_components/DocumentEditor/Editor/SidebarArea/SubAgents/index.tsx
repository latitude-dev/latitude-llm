import { useMemo, useCallback } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSidebarStore } from '../hooks/useSidebarStore'
import { usePromptConfigInSidebar } from '../hooks/usePromptConfigInSidebar'
import { SidebarSection } from '../Section'
import { SubAgentItem } from './SubAgentItem'
import { resolveRelativePath } from '@latitude-data/constants'
import { MultiSelect } from '@latitude-data/web-ui/molecules/MultiSelect'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useDocumentVersions from '$/stores/documentVersions'
import { useDocumentConfiguration } from '$/hooks/useDocumentConfiguration'

/**
 * Formats a file path to show location context.
 * Examples:
 * - "folder/file.txt" -> "folder/file.txt"
 * - "a/b/c/file.txt" -> "a/.../c/file.txt"
 * - "a/b/c/d/e/file.txt" -> "a/.../e/file.txt"
 */
function formatPathWithContext(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 2) return path
  if (parts.length === 3) return path

  // For longer paths, show: first-folder/.../parent-folder/file
  const firstFolder = parts[0]
  const parentFolder = parts[parts.length - 2]
  const fileName = parts[parts.length - 1]

  return `${firstFolder}/.../${parentFolder}/${fileName}`
}

// Sort paths like the files sidebar: nested paths (folders) first, then root-level files
// Both groups sorted alphabetically
function sortAgentPaths(a: string, b: string): number {
  const aHasFolder = a.includes('/')
  const bHasFolder = b.includes('/')

  // Nested paths (with folders) come first
  if (aHasFolder && !bHasFolder) return -1
  if (!aHasFolder && bHasFolder) return 1

  // Within same type, sort alphabetically
  return a.localeCompare(b)
}

export function SubAgentsSidebarSection() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const isLive = !!commit.mergedAt
  const { toggleAgent, setAgents } = usePromptConfigInSidebar()

  const { selectedAgents, pathToUuidMap } = useSidebarStore((state) => ({
    selectedAgents: state.selectedAgents,
    pathToUuidMap: state.pathToUuidMap,
  }))

  const { data: documentVersions } = useDocumentVersions({
    commitUuid: commit?.uuid,
    projectId: project.id,
  })

  const { documentConfigurations: agentDescriptions } =
    useDocumentConfiguration({
      documentVersions,
      selectedDocuments: selectedAgents,
      currentDocument: document,
    })

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

  const TriggerButton = useMemo(
    () => (
      <Button
        variant='ghost'
        size='none'
        iconProps={{ name: 'plus' }}
        className='min-w-7'
        disabled={isLive}
      />
    ),
    [isLive],
  )
  const agentOptions = useMemo(() => {
    const options = availableAgents.map((agentPath) => {
      const fileName = agentPath.split('/').pop() || agentPath
      const pathParts = agentPath.split('/')

      return {
        label: formatPathWithContext(agentPath),
        value: agentPath,
        icon: 'bot' as const,
        // Include full path, filename, and all folder names as searchable keywords
        keywords: [agentPath, fileName, ...pathParts],
      }
    })

    // Sort: selected items first, then by folder/file structure (folders first), then alphabetically
    return options.sort((a, b) => {
      const aSelected = selectedAgentsFullPaths.includes(a.value)
      const bSelected = selectedAgentsFullPaths.includes(b.value)

      // Selected items always come first
      if (aSelected && !bSelected) return -1
      if (!aSelected && bSelected) return 1

      // Within same selection state, use files sidebar sorting
      return sortAgentPaths(a.value, b.value)
    })
  }, [availableAgents, selectedAgentsFullPaths])

  const handleAgentsChange = useCallback(
    (selectedPaths: string[]) => {
      // MultiSelect with deferChangesUntilClose will only call this when popover closes
      setAgents(selectedPaths)
    },
    [setAgents],
  )

  const actions = useMemo(
    () => [
      {
        onClick: () => {},
        disabled: isLive,
        customComponent: (
          <MultiSelect
            modalPopover
            deferChangesUntilClose
            disabled={isLive}
            trigger={TriggerButton}
            options={agentOptions}
            value={selectedAgentsFullPaths}
            onChange={handleAgentsChange}
          />
        ),
      },
    ],
    [
      agentOptions,
      selectedAgentsFullPaths,
      handleAgentsChange,
      isLive,
      TriggerButton,
    ],
  )

  // Sort selected agents using the same logic as the files sidebar
  const sortedSelectedAgents = useMemo(() => {
    return [...selectedAgentsFullPaths].sort(sortAgentPaths)
  }, [selectedAgentsFullPaths])

  return (
    <SidebarSection title='Sub-agents' actions={actions}>
      <div className='flex flex-col'>
        {sortedSelectedAgents.map((agentPath) => {
          const documentUuid = pathToUuidMap[agentPath]
          const description = agentDescriptions[agentPath]?.description
          return (
            <SubAgentItem
              key={agentPath}
              agentPath={agentPath}
              documentUuid={documentUuid}
              projectId={project.id}
              commitUuid={commit.uuid}
              onRemove={() => toggleAgent(agentPath)}
              disabled={isLive}
              description={description}
            />
          )
        })}
      </div>
    </SidebarSection>
  )
}
