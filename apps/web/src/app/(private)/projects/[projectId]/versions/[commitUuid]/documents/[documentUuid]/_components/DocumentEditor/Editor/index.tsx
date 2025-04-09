'use client'

import EditorHeader from '$/components/EditorHeader'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useMetadata } from '$/hooks/useMetadata'
import { ROUTES } from '$/services/routes'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { DocumentVersion, ProviderApiKey } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import Playground from './Playground'
import { PlaygroundTextEditor } from './TextEditor'
import { UpdateToPromptLButton } from './UpdateToPromptl'

export default function DocumentEditor({
  document: _document,
  documents: _documents,
  providerApiKeys,
  freeRunsCount,
  copilotEnabled,
}: {
  document: DocumentVersion
  documents: DocumentVersion[]
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
  copilotEnabled: boolean
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const { data: integrations } = useIntegrations()
  const { data: documents, updateContent } = useDocumentVersions(
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
    [documents],
  )

  const [value, setValue] = useState(document.content)
  const [isSaved, setIsSaved] = useState(true)
  const [diff, setDiff] = useState<DiffOptions>()
  const debouncedSave = useDebouncedCallback(
    (val: string) => {
      updateContent({
        commitUuid: commit.uuid,
        projectId: project.id,
        documentUuid: document.documentUuid,
        content: val,
      })

      setIsSaved(true)
    },
    500,
    { trailing: true },
  )

  const { metadata, runReadMetadata } = useMetadata()
  useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
    metadata,
  })
  const { data: agentToolsMap } = useAgentToolsMap({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  useEffect(() => {
    runReadMetadata({
      prompt: value,
      documents,
      document,
      fullPath: document.path,
      promptlVersion: document.promptlVersion,
      agentToolsMap,
      providerNames: providers.map((p) => p.name) ?? [],
      integrationNames: integrations?.map((i) => i.name) ?? [],
    })
  }, [document.promptlVersion, agentToolsMap, providers, integrations])

  const onChange = useCallback(
    (newValue: string) => {
      setIsSaved(false)
      setValue(newValue)
      debouncedSave(newValue)
      runReadMetadata({
        prompt: newValue,
        documents,
        document,
        fullPath: document.path,
        promptlVersion: document.promptlVersion,
        agentToolsMap,
        providerNames: providers.map((p) => p.name) ?? [],
        integrationNames: integrations?.map((i) => i.name) ?? [],
      })
    },
    [
      runReadMetadata,
      document.path,
      document.promptlVersion,
      agentToolsMap,
      providers,
      integrations,
    ],
  )

  const isMerged = commit.mergedAt !== null

  const name = document.path.split('/').pop() ?? document.path
  return (
    <>
      <SplitPane
        className='pt-6'
        direction='horizontal'
        gap={4}
        initialPercentage={52}
        initialWidthClass='min-w-1/2'
        minSize={300}
        firstPane={
          <SplitPane.Pane>
            <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0 pl-6 pb-6'>
              <EditorHeader
                providers={providers}
                disabledMetadataSelectors={isMerged}
                title={name.length > 30 ? name.slice(0, 30) + '...' : name}
                rightActions={
                  <>
                    <Tooltip
                      asChild
                      trigger={
                        <Link
                          href={
                            ROUTES.projects
                              .detail({ id: project.id })
                              .commits.detail({ uuid: commit.uuid })
                              .history.detail({
                                uuid: document.documentUuid,
                              }).root
                          }
                        >
                          <Button
                            variant='outline'
                            size='small'
                            className='h-7'
                            iconProps={{
                              name: 'history',
                              color: 'foregroundMuted',
                            }}
                          />
                        </Link>
                      }
                    >
                      View prompt history
                    </Tooltip>
                    <UpdateToPromptLButton document={document} />
                  </>
                }
                leftActions={
                  <ClickToCopyUuid
                    tooltipContent='Click to copy the prompt UUID'
                    uuid={document.documentUuid}
                  />
                }
                metadata={metadata}
                prompt={value}
                onChangePrompt={onChange}
                freeRunsCount={freeRunsCount}
                showCopilotSetting={copilotEnabled}
              />
              <PlaygroundTextEditor
                compileErrors={metadata?.errors}
                project={project}
                document={document}
                commit={commit}
                setDiff={setDiff}
                diff={diff}
                value={value}
                copilotEnabled={copilotEnabled}
                isMerged={isMerged}
                isSaved={isSaved}
                onChange={onChange}
              />
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <div className='flex-1 relative max-h-full pr-6'>
              <Playground
                document={document}
                prompt={value}
                setPrompt={onChange}
                metadata={metadata!}
              />
            </div>
          </SplitPane.Pane>
        }
      />
    </>
  )
}
