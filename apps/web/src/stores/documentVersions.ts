'use client'

import { useCallback } from 'react'

import { HEAD_COMMIT, type DocumentVersion } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { assignDatasetAction } from '$/actions/documents/assignDatasetAction'
import { createDocumentVersionAction } from '$/actions/documents/create'
import { destroyDocumentAction } from '$/actions/documents/destroyDocumentAction'
import { destroyFolderAction } from '$/actions/documents/destroyFolderAction'
import { renameDocumentPathsAction } from '$/actions/documents/renamePathsAction'
import { updateDocumentContentAction } from '$/actions/documents/updateContent'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { useRouter } from 'next/navigation'
import useSWR, { SWRConfiguration } from 'swr'
import { useServerAction } from 'zsa-react'

export default function useDocumentVersions(
  {
    commitUuid = HEAD_COMMIT,
    projectId,
  }: { commitUuid?: string; projectId?: number } = { commitUuid: HEAD_COMMIT },
  opts: SWRConfiguration & {
    onSuccessCreate?: (document: DocumentVersion) => void
  } = {},
) {
  const { toast } = useToast()
  const { onSuccessCreate } = opts
  const router = useRouter()
  const { execute: executeCreateDocument } = useServerAction(
    createDocumentVersionAction,
    {
      onSuccess: ({ data: document }) => {
        onSuccessCreate?.(document)
      },
    },
  )
  const { execute: executeRenamePaths } = useServerAction(
    renameDocumentPathsAction,
  )
  const { execute: executeDestroyDocument, isPending: isDestroyingFile } =
    useServerAction(destroyDocumentAction)
  const { execute: executeDestroyFolder, isPending: isDestroyingFolder } =
    useServerAction(destroyFolderAction)

  const {
    mutate,
    data = [],
    isValidating,
    isLoading,
    error: swrError,
  } = useSWR<DocumentVersion[]>(
    ['documentVersions', projectId, commitUuid],
    useCallback(async () => {
      if (!commitUuid || !projectId) return []

      const response = await fetch(
        ROUTES.api.projects.detail(projectId).commits.detail(commitUuid).root,
        { credentials: 'include' },
      )
      if (!response.ok) {
        const error = await response.json()

        console.error(error)

        return []
      }

      return response.json()
    }, [projectId, commitUuid]),
    opts,
  )
  const createFile = useCallback(
    async ({ path }: { path: string }) => {
      if (!projectId) return

      const [document, error] = await executeCreateDocument({
        path,
        projectId,
        commitUuid,
      })

      if (error) {
        toast({
          title: 'Error creating document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else if (document) {
        const prevDocuments = data || []

        if (document) {
          mutate([...prevDocuments, document])
          router.push(
            ROUTES.projects
              .detail({ id: projectId! })
              .commits.detail({ uuid: commitUuid })
              .documents.detail({ uuid: document.documentUuid }).root,
          )
        }
      }
    },
    [executeCreateDocument, mutate, data, commitUuid],
  )

  const renamePaths = useCallback(
    async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      if (!projectId) return

      const [updatedDocuments, error] = await executeRenamePaths({
        oldPath,
        newPath,
        projectId,
        commitUuid,
      })

      if (updatedDocuments) {
        mutate(
          data.map((d) => {
            const updatedDocument = updatedDocuments.find(
              (ud) => ud.documentUuid === d.documentUuid,
            )
            return updatedDocument ? updatedDocument : d
          }),
        )
      }

      if (error) {
        toast({
          title: 'Error renaming paths',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      }
    },
    [executeRenamePaths, mutate, data, commitUuid],
  )

  const destroyFile = useCallback(
    async (documentUuid: string) => {
      if (!projectId) return

      const [_, error] = await executeDestroyDocument({
        documentUuid,
        projectId,
        commitUuid,
      })
      if (error) {
        toast({
          title: 'Error deleting document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else {
        const prevDocuments = data || []
        mutate(prevDocuments.filter((d) => d.documentUuid !== documentUuid))
        toast({
          title: 'Success',
          description: 'Document deleted',
        })
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid }).documents.root,
        )
      }
    },
    [executeDestroyDocument, mutate, data, commitUuid],
  )

  const destroyFolder = useCallback(
    async (path: string) => {
      if (!projectId) return

      const [_, error] = await executeDestroyFolder({
        projectId,
        commitUuid,
        path,
      })

      if (error) {
        toast({
          title: 'Error deleting folder',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else {
        await mutate()

        toast({
          title: 'Success',
          description: 'Folder deleted',
        })
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid }).documents.root,
        )
      }
    },
    [executeDestroyFolder, mutate, commitUuid],
  )

  const { execute: updateContent } = useLatitudeAction(
    updateDocumentContentAction,
    {
      onSuccess: ({ data: document }) => {
        const prevDocuments = data || []

        mutate(
          prevDocuments.map((d) =>
            d.documentUuid === document.documentUuid ? document : d,
          ),
        )
      },
    },
  )

  const { execute: assignDataset } = useLatitudeAction(assignDatasetAction, {
    onSuccess: ({ data: document }) => {
      const prevDocuments = data || []
      mutate(
        prevDocuments.map((d) =>
          d.documentUuid === document.documentUuid ? document : d,
        ),
      )
    },
  })

  return {
    data,
    isValidating: isValidating,
    isLoading: isLoading,
    error: swrError,
    createFile,
    renamePaths,
    destroyFile,
    destroyFolder,
    updateContent,
    assignDataset,
    mutate,
    isDestroying: isDestroyingFile || isDestroyingFolder,
  }
}
