import { useCallback, useMemo } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { DocumentRoutes } from '$/services/routes'
import { useMetadata } from '$/hooks/useMetadata'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { DocumentTabSelector, TabValue } from '../../../../DocumentTabs/tabs'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { useDeployPrompt } from '../../../../DocumentationModal'
import { TitleRow } from '../../EditorHeader/TitleRow'

export function DocumentEditorHeader({
  selectedTab,
  setSelectedTab,
  isPlaygroundOpen,
  isMerged,
  togglePlaygroundOpen,
  resetChat,
}: {
  isPlaygroundOpen: boolean
  isMerged: boolean
  togglePlaygroundOpen: () => void
  resetChat: () => void
  selectedTab: TabValue
  setSelectedTab: ReactStateDispatch<TabValue>
}) {
  const { metadata } = useMetadata()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const { updateDocumentContent } = useDocumentValue()
  const name = useMemo(
    () => document.path.split('/').pop() ?? document.path,
    [document.path],
  )
  const { toggleDocumentation } = useDeployPrompt()
  const onPreviewToggle = useCallback(
    (openPlayground: boolean) => {
      if (openPlayground === isPlaygroundOpen) return

      setSelectedTab(openPlayground ? 'preview' : DocumentRoutes.editor)
      togglePlaygroundOpen()
      resetChat()
    },
    [isPlaygroundOpen, togglePlaygroundOpen, resetChat, setSelectedTab],
  )
  return (
    <div className='w-full flex flex-col justify-center items-start gap-4 px-4 pb-4'>
      <div className='w-full flex flex-row items-center justify-between gap-4'>
        <DocumentTabSelector
          selectedTab={selectedTab}
          onSelectTab={setSelectedTab}
          projectId={String(project.id)}
          commitUuid={commit.uuid}
          documentUuid={document.documentUuid}
          onPreviewToggle={onPreviewToggle}
        />
        <Button
          variant='ghost'
          onClick={toggleDocumentation}
          iconProps={{ name: 'code2', placement: 'right' }}
          className='truncate hover:text-primary transition-colors'
          userSelect={false}
        >
          Deploy
        </Button>
      </div>
      <TitleRow
        title={name}
        isAgent={metadata?.config?.type === 'agent'}
        isMerged={isMerged}
        metadataConfig={metadata?.config}
        prompt={document.content}
        onChangePrompt={updateDocumentContent}
      />
    </div>
  )
}
