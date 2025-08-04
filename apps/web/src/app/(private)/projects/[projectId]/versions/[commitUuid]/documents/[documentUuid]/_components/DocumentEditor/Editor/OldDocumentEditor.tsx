import { MetadataProvider } from '$/components/MetadataProvider'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { DevModeProvider, useDevMode } from '$/hooks/useDevMode'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  DocumentValueProvider,
  useDocumentValue,
} from '$/hooks/useDocumentValueContext'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import useDocumentVersions from '$/stores/documentVersions'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { DocumentVersion, ProviderApiKey } from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useMemo } from 'react'
import { EvaluationEditorHeader } from '../../../(withTabs)/evaluations/[evaluationUuid]/editor/_components/EvaluationEditor/EditorHeader'
import DocumentTabs from '../../DocumentTabs'
import { PlaygroundBlocksEditor } from './BlocksEditor'
import { EditorHeader } from './EditorHeader'
import { useDiffState } from './hooks/useDiffState'
import { useLatteStreaming } from './hooks/useLatteStreaming'
import { useOldEditorHeaderActions } from './hooks/useOldEditorHeaderActions'
import { Playground } from './Playground'
import { PlaygroundTextEditor } from './TextEditor'

export type DocumentEditorProps = {
  document: DocumentVersion
  documents: DocumentVersion[]
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
  copilotEnabled: boolean
  initialDiff?: string
}

export function OldDocumentEditor(props: DocumentEditorProps) {
  return (
    <MetadataProvider>
      <DevModeProvider>
        <DocumentValueProvider document={props.document}>
          <OldDocumentEditorContent {...props} />
        </DocumentValueProvider>
      </DevModeProvider>
    </MetadataProvider>
  )
}

function OldDocumentEditorContent({
  document: _document,
  documents: _documents,
  providerApiKeys,
  freeRunsCount,
  copilotEnabled,
  initialDiff,
}: DocumentEditorProps) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { enabled: blocksEditorEnabled } = useFeatureFlag({
    featureFlag: 'blocksEditor',
  })
  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const { data: documents } = useDocumentVersions(
    {
      commitUuid: commit.uuid,
      projectId: project.id,
    },
    {
      fallbackData: _documents,
    },
  )

  const document = useMemo(
    () =>
      documents?.find((d) => d.documentUuid === _document.documentUuid) ??
      _document,
    [documents, _document],
  )
  const oldHeaderEditorActions = useOldEditorHeaderActions({
    project: useCurrentProject().project,
    commit: useCurrentCommit().commit,
    document,
  })
  const { metadata } = useMetadata()
  const isLatitudeProvider = useIsLatitudeProvider({ metadata })
  useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
  })
  const isMerged = commit.mergedAt !== null
  const { devMode } = useDevMode()
  const { value, setValue, updateDocumentContent, isSaved } = useDocumentValue()
  const { customReadOnlyMessage, highlightedCursorIndex } = useLatteStreaming({
    value,
    setValue,
  })
  const { diff, setDiff } = useDiffState(initialDiff, updateDocumentContent)
  const name = document.path.split('/').pop() ?? document.path
  const readOnlyMessage = isMerged
    ? 'Create a draft to edit documents.'
    : customReadOnlyMessage

  return (
    <DocumentTabs
      document={document}
      params={{
        projectId: String(project.id),
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      }}
    >
      <SplitPane
        visibleHandle={false}
        className='pt-6'
        direction='horizontal'
        reversed
        initialWidthClass='min-w-1/2'
        minSize={350}
        initialPercentage={50}
        firstPane={
          <SplitPane.Pane>
            <div className='flex flex-col flex-1 flex-grow flex-shrink gap-y-4 min-w-0 min-h-0 pl-6 pr-4 pb-6'>
              {blocksEditorEnabled ? (
                <EditorHeader
                  title={name}
                  prompt={value}
                  metadata={metadata}
                  onChangePrompt={updateDocumentContent}
                  isLatitudeProvider={isLatitudeProvider}
                  isMerged={isMerged}
                  freeRunsCount={freeRunsCount}
                />
              ) : (
                <EvaluationEditorHeader
                  documentVersion={document}
                  providers={providers}
                  disabledMetadataSelectors={isMerged}
                  title={name}
                  leftActions={oldHeaderEditorActions.leftActions}
                  rightActions={oldHeaderEditorActions.rightActions}
                  metadata={metadata}
                  prompt={document.content}
                  isLatitudeProvider={isLatitudeProvider}
                  onChangePrompt={updateDocumentContent}
                  freeRunsCount={freeRunsCount}
                />
              )}
              {devMode ? (
                <PlaygroundTextEditor
                  compileErrors={metadata?.errors}
                  project={project}
                  document={document}
                  commit={commit}
                  setDiff={setDiff}
                  diff={diff}
                  value={value}
                  defaultValue={document.content}
                  copilotEnabled={copilotEnabled}
                  readOnlyMessage={readOnlyMessage}
                  isSaved={isSaved}
                  onChange={updateDocumentContent}
                  highlightedCursorIndex={highlightedCursorIndex}
                />
              ) : (
                <PlaygroundBlocksEditor
                  project={project}
                  document={document}
                  commit={commit}
                  readOnlyMessage={readOnlyMessage}
                  defaultValue={metadata?.rootBlock}
                  onChange={updateDocumentContent}
                  config={metadata?.config}
                />
              )}
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <Playground
              document={document}
              prompt={document.content}
              setPrompt={updateDocumentContent}
              metadata={metadata!}
            />
          </SplitPane.Pane>
        }
      />
    </DocumentTabs>
  )
}
