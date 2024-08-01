'use client'

import { Suspense, useCallback } from 'react'

import type { Commit, DocumentVersion } from '@latitude-data/core/browser'
import {
  DocumentEditor,
  DocumentTextEditorFallback,
  useToast,
} from '@latitude-data/web-ui'
import { getDocumentContentByPathAction } from '$/actions/documents/getContentByPath'
import { updateDocumentContentAction } from '$/actions/documents/updateContent'
import { useServerAction } from 'zsa-react'

export default function ClientDocumentEditor({
  commit,
  document,
}: {
  commit: Commit
  document: DocumentVersion
}) {
  const updateDocumentAction = useServerAction(updateDocumentContentAction)
  const readDocumentContentAction = useServerAction(
    getDocumentContentByPathAction,
  )
  const { toast } = useToast()

  const readDocumentContent = useCallback(
    async (path: string) => {
      const [content, error] = await readDocumentContentAction.execute({
        projectId: commit.projectId,
        commitId: commit.id,
        path,
      })

      if (error) return undefined
      return content
    },
    [commit.id, readDocumentContentAction.status],
  )

  const saveDocumentContent = useCallback(
    async (content: string) => {
      const [_, error] = await updateDocumentAction.execute({
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        commitId: commit.id,
        content,
      })

      if (error) {
        toast({
          title: 'Could not save document',
          description: error.message,
          variant: 'destructive',
        })
      }
    },
    [commit, document, updateDocumentAction, toast],
  )

  return (
    <Suspense fallback={<DocumentTextEditorFallback />}>
      <DocumentEditor
        document={document.content}
        path={document.path}
        saveDocumentContent={saveDocumentContent}
        readDocumentContent={readDocumentContent}
      />
    </Suspense>
  )
}
