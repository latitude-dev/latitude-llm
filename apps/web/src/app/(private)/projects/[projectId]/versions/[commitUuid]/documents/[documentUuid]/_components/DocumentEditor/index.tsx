'use client'

import { Suspense, useCallback, useRef } from 'react'

import { Commit, DocumentVersion } from '@latitude-data/core'
import { DocumentEditor, useToast } from '@latitude-data/web-ui'
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

  const documentsByPathRef = useRef<{ [path: string]: string | undefined }>({})

  const readDocument = useCallback(
    async (path: string) => {
      const documentsByPath = documentsByPathRef.current
      if (!(path in documentsByPath)) {
        const [content, error] = await readDocumentContentAction.execute({
          projectId: commit.projectId,
          commitId: commit.id,
          path,
        })
        documentsByPathRef.current = {
          ...documentsByPath,
          [path]: error ? undefined : content,
        }
      }

      const documentContent = documentsByPath[path]
      if (documentContent === undefined) {
        throw new Error('Document not found')
      }

      return documentContent
    },
    [readDocumentContentAction.status, commit.id],
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
    <Suspense fallback={<div>Loading...</div>}>
      <DocumentEditor
        document={document.content}
        saveDocumentContent={saveDocumentContent}
        readDocument={readDocument}
      />
    </Suspense>
  )
}
