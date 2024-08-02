'use client'

import { Suspense, useCallback } from 'react'

import type { Commit, DocumentVersion } from '@latitude-data/core/browser'
import {
  DocumentEditor,
  DocumentTextEditorFallback,
  useToast,
} from '@latitude-data/web-ui'
import { updateDocumentContentAction } from '$/actions/documents/updateContent'
import useDocumentVersions from '$/stores/documentVersions'
import { useServerAction } from 'zsa-react'

export default function ClientDocumentEditor({
  commit,
  document,
}: {
  commit: Commit
  document: DocumentVersion
}) {
  const updateDocumentAction = useServerAction(updateDocumentContentAction)
  const { documents } = useDocumentVersions({ currentDocument: document })
  const { toast } = useToast()

  const readDocumentContent = useCallback(
    async (path: string) => {
      return documents.find((d) => d.path === path)?.content
    },
    [documents],
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
