'use client'

import { EditorHeader } from '$/components/EditorHeader'
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
import { PlaygroundTextEditor } from './TextEditor'
import { UpdateToPromptLButton } from './UpdateToPromptl'
import { Playground } from './Playground'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

export default function DocumentEditor({
  document: _document,
  documents: _documents,
  providerApiKeys,
  freeRunsCount,
  copilotEnabled,
  initialDiff,
}: {
  document: DocumentVersion
  documents: DocumentVersion[]
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
  copilotEnabled: boolean
  initialDiff?: string
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const { data: integrations } = useIntegrations()
  const {
    data: documents,
    updateContent,
    isUpdatingContent,
  } = useDocumentVersions(
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

  const [value, setValue] = useState(document.content)
  const { toast } = useToast()
  const debouncedSave = useDebouncedCallback(
    async (val: string) => {
      const [_, error] = await updateContent({
        commitUuid: commit.uuid,
        projectId: project.id,
        documentUuid: document.documentUuid,
        content: val,
      })

      if (error) {
        toast({
          title: 'Error saving document',
          description: 'There was an error saving the document.',
          variant: 'destructive',
        })

        setValue(document.content)
      } else {
        runReadMetadata({
          prompt: val,
          documents,
          document,
          fullPath: document.path,
          promptlVersion: document.promptlVersion,
          agentToolsMap,
          providerNames: providers.map((p) => p.name) ?? [],
          integrationNames: integrations?.map((i) => i.name) ?? [],
        })
      }
    },
    500,
    { leading: false, trailing: true },
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
  }, [
    document.promptlVersion,
    agentToolsMap,
    providers,
    integrations,
    document,
    documents,
    runReadMetadata,
    value,
  ])

  const onChange = useCallback(
    async (newValue: string) => {
      setValue(newValue)

      debouncedSave(newValue)
    },
    [debouncedSave, setValue],
  )

  const [diff, setDiff] = useState<DiffOptions | undefined>(
    initialDiff
      ? {
          newValue: initialDiff,
          onAccept: (newValue: string) => {
            setDiff(undefined)
            onChange(newValue)

            // Remove applyExperimentId from URL
            if (window?.location) {
              const url = new URL(window.location.href)
              url.searchParams.delete('applyExperimentId')
              window.history.replaceState({}, '', url.toString())
            }
          },
          onReject: () => {
            setDiff(undefined)

            // Remove applyExperimentId from URL
            if (window?.location) {
              const url = new URL(window.location.href)
              url.searchParams.delete('applyExperimentId')
              window.history.replaceState({}, '', url.toString())
            }
          },
        }
      : undefined,
  )

  const isMerged = commit.mergedAt !== null

  const name = document.path.split('/').pop() ?? document.path
  return (
    <>
      <SplitPane
        className='pt-6'
        direction='horizontal'
        reversed
        gap={4}
        initialWidthClass='min-w-1/2'
        minSize={350}
        initialPercentage={40}
        firstPane={
          <SplitPane.Pane>
            <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0 pl-6 pb-6'>
              <EditorHeader
                documentVersion={document}
                providers={providers}
                disabledMetadataSelectors={isMerged}
                title={name}
                rightActions={useMemo(
                  () => (
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
                  ),
                  [project.id, commit.uuid, document],
                )}
                leftActions={useMemo(
                  () => (
                    <ClickToCopyUuid
                      tooltipContent='Click to copy the prompt UUID'
                      uuid={document.documentUuid}
                    />
                  ),
                  [document.documentUuid],
                )}
                metadata={metadata}
                prompt={document.content}
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
                defaultValue={document.content}
                copilotEnabled={copilotEnabled}
                isMerged={isMerged}
                isSaved={!isUpdatingContent}
                onChange={onChange}
              />
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <div className='flex-1 relative max-h-full pl-4'>
              <Playground
                document={document}
                prompt={document.content}
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
