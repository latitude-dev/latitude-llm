'use client'

import path from 'path'
import {
  createContext,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  ConversationMetadata,
  readMetadata,
  Document as RefDocument,
} from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'
import {
  DocumentTextEditor,
  DocumentTextEditorFallback,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { type AddMessagesActionFn } from '$/actions/sdk/addMessagesAction'
import type { RunDocumentActionFn } from '$/actions/sdk/runDocumentAction'
import EditorHeader from '$/components/EditorHeader'
import useDocumentVersions from '$/stores/documentVersions'
import { useDebouncedCallback } from 'use-debounce'

import Playground from './Playground'

export const DocumentEditorContext = createContext<
  | {
      runDocumentAction: RunDocumentActionFn
      addMessagesAction: AddMessagesActionFn
    }
  | undefined
>(undefined)

export default function DocumentEditor({
  runDocumentAction,
  addMessagesAction,
  document,
  documents,
}: {
  runDocumentAction: Function
  addMessagesAction: Function
  document: DocumentVersion
  documents: DocumentVersion[]
}) {
  const { data: _documents, updateContent } = useDocumentVersions(undefined, {
    fallbackData: documents,
  })
  const [value, setValue] = useState(document.content)
  const [isSaved, setIsSaved] = useState(true)
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

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

  const onChange = useCallback((value: string) => {
    setIsSaved(false)
    setValue(value)
    debouncedSave(value)
  }, [])

  const readDocumentContent = useCallback(
    async (path: string) => {
      return _documents.find((d) => d.path === path)?.content
    },
    [_documents],
  )

  const readDocument = useCallback(
    async (
      refPath: string,
      from?: string,
    ): Promise<RefDocument | undefined> => {
      const fullPath = path
        .resolve(path.dirname(`/${from ?? ''}`), refPath)
        .replace(/^\//, '')

      if (fullPath === document.path) {
        return {
          path: fullPath,
          content: value,
        }
      }

      const content = await readDocumentContent(fullPath)
      if (content === undefined) return undefined

      return {
        path: fullPath,
        content,
      }
    },
    [readDocumentContent, value],
  )

  useEffect(() => {
    readMetadata({
      prompt: value,
      fullPath: document.path,
      referenceFn: readDocument,
    }).then(setMetadata)
  }, [readDocument])

  return (
    <DocumentEditorContext.Provider
      value={{
        runDocumentAction: runDocumentAction as RunDocumentActionFn,
        addMessagesAction: addMessagesAction as AddMessagesActionFn,
      }}
    >
      <div className='flex flex-row w-full h-full gap-8 p-6'>
        <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
          <EditorHeader
            title='Prompt editor'
            metadata={metadata}
            prompt={value}
            onChangePrompt={onChange}
          />
          <Suspense fallback={<DocumentTextEditorFallback />}>
            <DocumentTextEditor
              value={value}
              metadata={metadata}
              onChange={onChange}
              readOnlyMessage={
                commit.mergedAt
                  ? 'Create a draft to edit documents.'
                  : undefined
              }
              isSaved={isSaved}
            />
          </Suspense>
        </div>
        <div className='flex flex-col flex-1 gap-2'>
          <Playground document={document} metadata={metadata!} />
        </div>
      </div>
    </DocumentEditorContext.Provider>
  )
}
