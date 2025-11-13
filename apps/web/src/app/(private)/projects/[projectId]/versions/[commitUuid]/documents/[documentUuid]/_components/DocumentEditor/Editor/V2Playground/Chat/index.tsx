import { ErrorMessage, MessageList } from '$/components/ChatWrapper'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import { memo, useMemo } from 'react'
import Actions, { ActionsState } from './Actions'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'
import { useUIAnnotations } from '$/hooks/annotations/useUIAnnotations'
import { DocumentLogWithMetadata } from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ProviderLogDto } from '@latitude-data/core/schema/types'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import useFeature from '$/stores/useFeature'

export default function Chat({
  debugMode,
  parameters,
  playground,
  setDebugMode,
  showHeader,
}: {
  parameters: Record<string, unknown> | undefined
  playground: ReturnType<typeof usePlaygroundChat>
  showHeader: boolean
} & ActionsState) {
  const toolContentMap = useToolContentMap(playground.messages)
  const parameterKeys = useMemo(
    () => Object.keys(parameters ?? {}),
    [parameters],
  )

  return (
    <div className='w-full flex flex-col flex-1'>
      {showHeader && (
        <Header debugMode={debugMode} setDebugMode={setDebugMode} />
      )}

      <Messages
        messages={playground.messages}
        annotationData={playground.annotationData}
        error={playground.error}
        parameterKeys={parameterKeys}
        debugMode={debugMode ?? false}
        toolContentMap={toolContentMap}
      />
    </div>
  )
}

function Header({ debugMode, setDebugMode }: ActionsState) {
  return (
    <div className='flex flex-row items-center justify-between w-full pb-3'>
      <Text.H6M>Prompt</Text.H6M>
      <Actions debugMode={debugMode} setDebugMode={setDebugMode} />
    </div>
  )
}

const Messages = memo(function Messages({
  messages,
  annotationData,
  error,
  parameterKeys,
  debugMode,
  toolContentMap,
}: {
  messages: ReturnType<typeof usePlaygroundChat>['messages']
  annotationData: ReturnType<typeof usePlaygroundChat>['annotationData']
  error: ReturnType<typeof usePlaygroundChat>['error']
  parameterKeys: string[]
  debugMode: boolean
  toolContentMap: ReturnType<typeof useToolContentMap>
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  return (
    <div className='flex flex-col gap-3 flex-grow flex-shrink min-h-0'>
      <MessageList
        messages={messages}
        parameters={parameterKeys}
        debugMode={debugMode}
        toolContentMap={toolContentMap}
      />

      {error && <ErrorMessage error={error} />}

      {annotationData.isReady ? (
        <AnnoatationLogForm
          project={project}
          commit={commit}
          documentLog={annotationData.documentLog}
          providerLog={annotationData.providerLog}
        />
      ) : null}
    </div>
  )
})

function AnnoatationLogForm({
  project,
  commit,
  documentLog,
  providerLog,
}: {
  project: Project
  commit: Commit
  documentLog: DocumentLogWithMetadata
  providerLog: ProviderLogDto
}) {
  const issuesFeature = useFeature('issues')
  const uiAnnotations = useUIAnnotations({
    project,
    commit,
    documentLog,
    providerLog,
  })

  if (!issuesFeature.isEnabled) return null

  const manualAnnotation = uiAnnotations.annotations.bottom

  if (!manualAnnotation || uiAnnotations.isLoading) return null

  return (
    <div className='w-full border-t flex flex-col gap-y-4 mt-4 p-4'>
      <AnnotationForm
        commit={commit}
        documentLog={documentLog}
        providerLog={providerLog}
        evaluation={manualAnnotation.evaluation}
        result={manualAnnotation.result}
        mutateEvaluationResults={uiAnnotations.mutateResults}
        annotateEvaluation={uiAnnotations.annotateEvaluation}
        isAnnotatingEvaluation={uiAnnotations.isAnnotatingEvaluation}
      />
    </div>
  )
}
