'use client'

import { useCallback, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentTabSelector, TabValue } from '../../DocumentTabs/tabs'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { DocumentRoutes } from '$/services/routes'
import { useDeployPrompt } from '../../DocumentationModal'
import { DocumentEditorContentArea } from './ContentArea'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useToggleStates } from './ContentArea/hooks/usePlaygroundLogic'
import { DocumentEditorSidebarArea } from './SidebarArea'
import { DocumentParametersProvider } from './V2Playground/DocumentParams/DocumentParametersContext'

export default function DocumentEditor(props: {
  freeRunsCount?: number
  showPreview?: boolean
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const [selectedTab, setSelectedTab] = useState<TabValue>(
    props.showPreview ? 'preview' : DocumentRoutes.editor,
  )
  const { toggleDocumentation } = useDeployPrompt()
  const {
    isPlaygroundOpen,
    isPlaygroundTransitioning,
    isExperimentModalOpen,
    togglePlaygroundOpen,
    toggleExperimentModal,
  } = useToggleStates({ showPreview: props.showPreview })
  const onPreviewToggle = useCallback(
    (openPlayground: boolean) => {
      if (openPlayground === isPlaygroundOpen) return

      setSelectedTab(openPlayground ? 'preview' : DocumentRoutes.editor)
      togglePlaygroundOpen()
    },
    [isPlaygroundOpen, togglePlaygroundOpen, setSelectedTab],
  )
  return (
    <div className='pt-6 px-6 gap-y-6 flex flex-col h-full w-full'>
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
          className='truncate font-normal hover:text-primary transition-colors'
          userSelect={false}
        >
          <Text.H5 ellipsis noWrap>
            Deploy this prompt
          </Text.H5>
        </Button>
      </div>
      <div className='flex flex-1 gap-x-8 min-h-0'>
        <div className='flex flex-1 h-full'>
          <DocumentParametersProvider documentUuid={document.documentUuid}>
            <DocumentEditorContentArea
              setSelectedTab={setSelectedTab}
              isPlaygroundOpen={isPlaygroundOpen}
              isPlaygroundTransitioning={isPlaygroundTransitioning}
              isExperimentModalOpen={isExperimentModalOpen}
              toggleExperimentModal={toggleExperimentModal}
              togglePlaygroundOpen={togglePlaygroundOpen}
            />
          </DocumentParametersProvider>
        </div>
        <div className='flex min-w-56 w-96 min-h-0 pr-2'>
          <DocumentEditorSidebarArea freeRunsCount={props.freeRunsCount} />
        </div>
      </div>
    </div>
  )
}
