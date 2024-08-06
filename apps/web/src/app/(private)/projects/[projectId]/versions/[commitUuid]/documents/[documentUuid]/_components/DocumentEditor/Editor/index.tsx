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
  AppLocalStorage,
  DocumentTextEditor,
  DocumentTextEditorFallback,
  DropdownMenu,
  useCurrentCommit,
  useCurrentProject,
  useLocalStorage,
} from '@latitude-data/web-ui'
import type { StreamTextOutputAction } from '$/actions/documents/streamTextAction'
import useDocumentVersions from '$/stores/documentVersions'
import { useDebouncedCallback } from 'use-debounce'

import { Header } from './Header'
import Playground from './Playground'

export const DocumentEditorContext = createContext<
  | {
      streamTextAction: StreamTextOutputAction
    }
  | undefined
>(undefined)

export default function DocumentEditor({
  streamTextAction,
  document,
  documents,
}: {
  streamTextAction: Function
  document: DocumentVersion
  documents: DocumentVersion[]
}) {
  const { data: _documents, updateContent } = useDocumentVersions(undefined, {
    fallbackData: documents,
  })
  const [value, setValue] = useState(document.content)
  const [isSaved, setIsSaved] = useState(true)
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  const { value: showLineNumbers, setValue: setShowLineNumbers } =
    useLocalStorage({
      key: AppLocalStorage.editorLineNumbers,
      defaultValue: true,
    })
  const { value: wrapText, setValue: setWrapText } = useLocalStorage({
    key: AppLocalStorage.editorWrapText,
    defaultValue: true,
  })
  const { value: showMinimap, setValue: setShowMinimap } = useLocalStorage({
    key: AppLocalStorage.editorMinimap,
    defaultValue: false,
  })

  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  const debouncedSave = useDebouncedCallback(
    (val: string) => {
      updateContent({
        commitId: commit.id,
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
      value={{ streamTextAction: streamTextAction as StreamTextOutputAction }}
    >
      <div className='flex flex-row w-full h-full gap-8 p-6'>
        <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
          <Header title='Prompt editor'>
            <DropdownMenu
              options={[
                {
                  label: 'Show line numbers',
                  onClick: () => setShowLineNumbers(!showLineNumbers),
                  checked: showLineNumbers,
                },
                {
                  label: 'Wrap text',
                  onClick: () => setWrapText(!wrapText),
                  checked: wrapText,
                },
                {
                  label: 'Show minimap',
                  onClick: () => setShowMinimap(!showMinimap),
                  checked: showMinimap,
                },
              ]}
              side='bottom'
              align='end'
            />
          </Header>
          <Suspense fallback={<DocumentTextEditorFallback />}>
            <DocumentTextEditor
              value={value}
              metadata={metadata}
              onChange={onChange}
              readOnlyMessage={
                commit.mergedAt ? 'Create a draft to edit documents' : undefined
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
